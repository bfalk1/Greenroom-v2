import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { tierNameForStripePrice } from "@/lib/stripe/config";
import { trackSubscriptionActivatedServer } from "@/lib/analyticsServer";

// Nightly Stripe↔DB reconciliation. The webhook is the primary grant path,
// but it is a single point of failure that has already failed silently once
// (July 2026: endpoint on the apex domain, every delivery 307'd, two paying
// customers got nothing until a manual re-drive). This sweep guarantees every
// live Stripe subscription eventually has a DB row + initial credits, and
// makes any divergence a logged, counted signal instead of a customer
// complaint. Mirrors api/cron/paypal-subscriptions (CRON_SECRET, GET+POST).
//
// Idempotency: the initial grant is keyed per-subscription via the
// SUBSCRIPTION creditTransaction referencing the Stripe sub id — the webhook
// checks the same marker, so whichever path runs second no-ops.

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error("CRON_SECRET not configured — refusing to run");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

function getPeriodDates(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    periodStart: new Date(item.current_period_start * 1000),
    periodEnd: new Date(item.current_period_end * 1000),
  };
}

async function resolveUserId(
  subscription: Stripe.Subscription
): Promise<string | null> {
  // Preferred: metadata written by the checkout route (subscription_data).
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  // Fallback for subs created before metadata was added: customer id lookup.
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function reconcileOne(subscription: Stripe.Subscription): Promise<
  "ok" | "repaired" | "unresolvable"
> {
  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error(
      `[stripe-reconcile] live subscription ${subscription.id} cannot be attributed to a user (no metadata.userId, unknown customer)`
    );
    return "unresolvable";
  }

  const priceId = subscription.items.data[0]?.price.id;
  const tierName = priceId ? tierNameForStripePrice(priceId) : null;
  const tier = tierName
    ? await prisma.subscriptionTier.findFirst({
        where: { name: tierName, isActive: true },
      })
    : null;
  if (!tier) {
    console.error(
      `[stripe-reconcile] subscription ${subscription.id}: cannot resolve tier (priceId=${priceId ?? "none"})`
    );
    return "unresolvable";
  }

  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, provider: true },
  });

  const alreadyGranted = await prisma.creditTransaction.findFirst({
    where: { userId, type: "SUBSCRIPTION", referenceId: subscription.id },
    select: { id: true },
  });

  const rowCurrent =
    existing?.provider === "stripe" &&
    existing.stripeSubscriptionId === subscription.id;

  if (rowCurrent && alreadyGranted) {
    return "ok";
  }

  // Never clobber a PayPal-owned row from a reconcile sweep — the webhook's
  // provider guards own that arbitration; just surface it.
  if (existing?.provider === "paypal" && !rowCurrent) {
    console.error(
      `[stripe-reconcile] user ${userId} has live Stripe sub ${subscription.id} but a PayPal-owned row — possible double subscription, needs manual review`
    );
    return "unresolvable";
  }

  const { periodStart, periodEnd } = getPeriodDates(subscription);
  const acquisitionSource = subscription.metadata?.acquisitionSource ?? null;

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tierId: tier.id,
      provider: "stripe",
      stripeSubscriptionId: subscription.id,
      paypalSubscriptionId: null,
      ...(acquisitionSource ? { acquisitionSource } : {}),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      tierId: tier.id,
      provider: "stripe",
      stripeSubscriptionId: subscription.id,
      acquisitionSource,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  if (!alreadyGranted) {
    await prisma.$transaction([
      prisma.stripeWebhookEvent.create({
        data: { id: `reconcile:${subscription.id}`, type: "reconcile" },
      }),
      prisma.creditBalance.upsert({
        where: { userId },
        update: { balance: { increment: tier.creditsPerMonth } },
        create: { userId, balance: tier.creditsPerMonth },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "active" },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          amount: tier.creditsPerMonth,
          type: "SUBSCRIPTION",
          referenceId: subscription.id,
          note: `${tier.displayName} subscription — initial ${tier.creditsPerMonth} credits (reconciled)`,
        },
      }),
    ]);

    trackSubscriptionActivatedServer({
      userId,
      plan: tier.name,
      provider: "stripe",
      lifetime: acquisitionSource === "vip-lifetime",
      source: acquisitionSource,
      via: "reconcile",
    });
  } else {
    // Row was stale/missing but credits were granted before — status flag
    // still needs to reflect the live subscription.
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: "active" },
    });
  }

  console.log(
    `[stripe-reconcile] repaired subscription ${subscription.id} for user ${userId} (${tier.name}${alreadyGranted ? ", credits already granted" : ", credits granted"})`
  );
  return "repaired";
}

async function runReconcile(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let ok = 0;
    let repaired = 0;
    let unresolvable = 0;

    // All live active/past_due subs — the account is small enough to sweep
    // fully; auto-pagination keeps this correct as it grows.
    for (const status of ["active", "past_due"] as const) {
      for await (const subscription of stripe.subscriptions.list({
        status,
        limit: 100,
      })) {
        const result = await reconcileOne(subscription);
        if (result === "ok") ok += 1;
        else if (result === "repaired") repaired += 1;
        else unresolvable += 1;
      }
    }

    if (repaired > 0 || unresolvable > 0) {
      // Loud line for log-based alerting: any non-zero repair means the
      // webhook path dropped something since the last sweep.
      console.error(
        `[stripe-reconcile] divergence: repaired=${repaired} unresolvable=${unresolvable} (ok=${ok})`
      );
    }

    return NextResponse.json({ ok: true, checked: ok + repaired + unresolvable, repaired, unresolvable });
  } catch (error) {
    console.error("Stripe subscription reconcile cron failed:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

// Vercel cron invokes with GET (Authorization: Bearer CRON_SECRET);
// POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return runReconcile(request);
}

export async function POST(request: NextRequest) {
  return runReconcile(request);
}

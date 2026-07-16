import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { tierNameForStripePrice } from "@/lib/stripe/config";
import { trackSubscriptionActivatedServer } from "@/lib/analyticsServer";
import { grantReferralRewardIfVip } from "@/lib/referralActivation";

// Nightly Stripe↔DB reconciliation. The webhook is the primary grant path,
// but it is a single point of failure that has already failed silently once
// (July 2026: endpoint on the apex domain, every delivery 307'd, two paying
// customers got nothing until a manual re-drive). This sweep guarantees every
// live Stripe subscription eventually has a DB row + initial credits, and
// makes any divergence a logged, counted signal instead of a customer
// complaint. Mirrors api/cron/paypal-subscriptions (CRON_SECRET, GET+POST).
//
// Idempotency: the initial grant is keyed by the shared `grant:<subId>`
// stripe_webhook_events marker — the webhook inserts the SAME marker in its
// grant transaction, so a concurrent webhook/cron race conflicts on the PK
// and exactly one grant commits.

export const maxDuration = 300;

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

async function reconcileOne(
  subscription: Stripe.Subscription,
  userId: string
): Promise<"ok" | "repaired"> {
  const priceId = subscription.items.data[0]?.price.id;
  const tierName = priceId ? tierNameForStripePrice(priceId) : null;
  const tier = tierName
    ? await prisma.subscriptionTier.findFirst({
        where: { name: tierName, isActive: true },
      })
    : null;
  if (!tier) {
    throw new Error(
      `subscription ${subscription.id}: cannot resolve tier (priceId=${priceId ?? "none"})`
    );
  }

  // Backstop the referral reward independently of the credit-grant marker: a
  // referred user who reached VIP (fresh checkout whose referral grant
  // transiently failed, or a GA→VIP upgrade the webhooks didn't pay) is paid
  // here on the nightly sweep, within the 30-day window. Runs BEFORE the
  // already-granted early return so a healthy sub with an unpaid pending
  // referral is still repaired. Idempotent — a no-op once rewarded / for
  // non-referrals. The cron lists active + past_due subs; only ACTIVE ones pay
  // (a past_due/dunning sub that recovers is caught by a later active sweep).
  // The subscription's own creation time is the window reference, so a
  // within-window activation caught only on a later sweep is still paid (not
  // falsely expired against wall-clock).
  await grantReferralRewardIfVip(
    userId,
    tier.name,
    subscription.status === "active",
    "reconcile",
    new Date(subscription.created * 1000)
  );

  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, provider: true },
  });

  const alreadyGranted = await prisma.stripeWebhookEvent.findUnique({
    where: { id: `grant:${subscription.id}` },
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
    throw new Error(
      `user ${userId} has live Stripe sub ${subscription.id} but a PayPal-owned row — possible double subscription, needs manual review`
    );
  }

  const { periodStart, periodEnd } = getPeriodDates(subscription);
  const acquisitionSource = subscription.metadata?.acquisitionSource ?? null;
  // Mirror Stripe's own status: a past_due sub must not be flipped back to
  // "active", or dunning state (set by invoice.payment_failed) is clobbered.
  const statusFlag =
    subscription.status === "past_due" ? "past_due" : "active";

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
    try {
      await prisma.$transaction([
        prisma.stripeWebhookEvent.create({
          data: { id: `grant:${subscription.id}`, type: "initial-grant" },
        }),
        prisma.creditBalance.upsert({
          where: { userId },
          update: { balance: { increment: tier.creditsPerMonth } },
          create: { userId, balance: tier.creditsPerMonth },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: statusFlag },
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
      // (The referral reward is granted unconditionally at the top of
      // reconcileOne, so a healthy-but-unpaid pending referral is repaired too.)
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        // The webhook granted concurrently — exactly what the shared marker
        // is for. The row repair above still counts.
        console.log(
          `[stripe-reconcile] grant for ${subscription.id} raced the webhook — webhook won, no double-grant`
        );
      } else {
        throw error;
      }
    }
  } else {
    // Row was stale/missing but credits were granted before — status flag
    // still needs to reflect the live subscription.
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: statusFlag },
    });
  }

  console.log(
    `[stripe-reconcile] repaired subscription ${subscription.id} for user ${userId} (${tier.name}${alreadyGranted ? ", credits already granted" : ""})`
  );
  return "repaired";
}

async function runReconcile(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Gather first, then reconcile: a user with TWO live Stripe subs must be
    // surfaced for manual review, not "repaired" — the single row per user
    // would otherwise flip-flop between the subs on every sweep.
    const byUser = new Map<string, Stripe.Subscription[]>();
    let unattributed = 0;

    for (const status of ["active", "past_due"] as const) {
      for await (const subscription of stripe.subscriptions.list({
        status,
        limit: 100,
      })) {
        const userId = await resolveUserId(subscription);
        if (!userId) {
          console.error(
            `[stripe-reconcile] live subscription ${subscription.id} cannot be attributed to a user (no metadata.userId, unknown customer)`
          );
          unattributed += 1;
          continue;
        }
        const list = byUser.get(userId) ?? [];
        list.push(subscription);
        byUser.set(userId, list);
      }
    }

    let ok = 0;
    let repaired = 0;
    let unresolvable = unattributed;

    for (const [userId, subs] of byUser) {
      if (subs.length > 1) {
        console.error(
          `[stripe-reconcile] user ${userId} has ${subs.length} live Stripe subscriptions (${subs.map((s) => s.id).join(", ")}) — possible double-billing, needs manual review; skipping`
        );
        unresolvable += 1;
        continue;
      }
      try {
        const result = await reconcileOne(subs[0], userId);
        if (result === "ok") ok += 1;
        else repaired += 1;
      } catch (error) {
        console.error(
          `[stripe-reconcile] ${error instanceof Error ? error.message : error}`
        );
        unresolvable += 1;
      }
    }

    if (repaired > 0 || unresolvable > 0) {
      // Loud line for log-based alerting: any non-zero repair means the
      // webhook path dropped something since the last sweep.
      console.error(
        `[stripe-reconcile] divergence: repaired=${repaired} unresolvable=${unresolvable} (ok=${ok})`
      );
    }

    return NextResponse.json({
      ok: true,
      checked: ok + repaired + unresolvable,
      repaired,
      unresolvable,
    });
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

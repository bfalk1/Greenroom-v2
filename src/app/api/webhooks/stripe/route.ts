import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { tierNameForStripePrice } from "@/lib/stripe/config";
import { trackSubscriptionActivatedServer } from "@/lib/analyticsServer";
import {
  capiAttributionFromMetadata,
  metaCapiPurchase,
  capiIdentityFromProfile,
} from "@/lib/metaCapiServer";
import { grantReferralRewardIfVip } from "@/lib/referralActivation";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extract period dates from subscription items (clover API) */
function getPeriodDates(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    periodStart: new Date(item.current_period_start * 1000),
    periodEnd: new Date(item.current_period_end * 1000),
  };
}

async function handleCreditPurchase(
  session: Stripe.Checkout.Session,
  eventId: string,
  eventType: string
) {
  const userId = session.metadata?.userId;
  const credits = parseInt(session.metadata?.credits || "0", 10);

  if (!userId || !credits) {
    console.error("Missing userId or credits in credit purchase metadata");
    return;
  }

  // Atomic: event marker + balance + transaction commit together. The marker is
  // the first op so a redelivered event conflicts on the PK and rolls back the
  // whole grant (idempotency — each event applies exactly once).
  await prisma.$transaction([
    prisma.stripeWebhookEvent.create({ data: { id: eventId, type: eventType } }),
    prisma.creditBalance.upsert({
      where: { userId },
      update: { balance: { increment: credits } },
      create: { userId, balance: credits },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount: credits,
        type: "PURCHASE",
        referenceId: session.id,
        note: `Purchased ${credits} credits`,
      },
    }),
  ]);

  console.log(`Issued ${credits} credits to user ${userId} (one-time purchase)`);
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  eventType: string
) {
  // Handle one-time credit purchases separately
  if (session.metadata?.type === "credit_purchase") {
    return handleCreditPurchase(session, eventId, eventType);
  }

  const userId = session.metadata?.userId;
  if (!userId) {
    // Throw, don't skip: a paid session we can't attribute must surface as a
    // failing delivery in the Stripe dashboard (and retry), never as a silent
    // 200 that leaves a paying customer with nothing.
    throw new Error(
      `checkout.session.completed ${session.id}: no userId in session metadata — paid session cannot be granted`
    );
  }

  // Expand the subscription to get the price
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  const priceId = subscription.items.data[0]?.price.id;

  if (!priceId) {
    throw new Error(
      `checkout.session.completed ${session.id}: no priceId on subscription ${subscription.id}`
    );
  }

  // Resolve the tier from the env price map (single source of truth — mirrors
  // the checkout route), then load the row by its stable name for the FK id +
  // credits. The DB stripe_price_id column is intentionally not consulted, so a
  // rotated price ID can't leave a paying subscriber unresolvable here (which
  // would silently skip their subscription record + credit grant).
  const tierName = tierNameForStripePrice(priceId);
  const tier = tierName
    ? await prisma.subscriptionTier.findFirst({
        where: { name: tierName, isActive: true },
      })
    : null;

  if (!tier) {
    // Unknown price or missing/inactive tier row: both mean a PAID
    // subscription we cannot grant. Throw → 500 → Stripe retries and the
    // endpoint shows as failing, instead of the historical silent-skip.
    throw new Error(
      `checkout.session.completed ${session.id}: cannot resolve tier (priceId=${priceId}, envTierName=${tierName ?? "none"}, dbRow=${tierName ? "missing/inactive" : "n/a"}) — paid subscription not granted`
    );
  }

  // Attribution: written by the checkout route into both session and
  // subscription metadata; store on the row so revenue can be attributed to
  // the offer that produced it.
  const acquisitionSource =
    session.metadata?.acquisitionSource ??
    subscription.metadata?.acquisitionSource ??
    null;

  const { periodStart, periodEnd } = getPeriodDates(subscription);

  // Create or update subscription. Status lives on users.subscription_status
  // (single source of truth) — Subscription only stores tier/period/Stripe IDs.
  // provider/paypalSubscriptionId reset matters for returning subscribers:
  // the row is one-per-user, so a former PayPal sub must flip back to stripe
  // or the PayPal expiry cron could cancel an active Stripe subscriber.
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tierId: tier.id,
      provider: "stripe",
      stripeSubscriptionId: subscription.id,
      paypalSubscriptionId: null,
      acquisitionSource,
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
      cancelAtPeriodEnd: false,
    },
  });

  // The initial grant is once per SUBSCRIPTION, not just once per event: the
  // reconcile cron (api/cron/stripe-subscriptions) may have granted this sub
  // already during a webhook outage, and a manually re-driven event carries a
  // fresh event id that the event marker alone wouldn't catch. Fast-path skip
  // here; the ATOMIC guarantee is the shared `grant:<subId>` marker row in the
  // transaction below — webhook and cron both insert it, so a concurrent race
  // conflicts on the PK and rolls the loser back (never a double-grant).
  const alreadyGranted = await prisma.stripeWebhookEvent.findUnique({
    where: { id: `grant:${subscription.id}` },
    select: { id: true },
  });
  if (alreadyGranted) {
    console.log(
      `Initial grant for Stripe subscription ${subscription.id} already recorded — skipping credits`
    );
    return;
  }

  // Atomic: event marker + grant marker + balance + subscription_status flag +
  // transaction must commit together (idempotency — see handleCreditPurchase).
  await prisma.$transaction([
    prisma.stripeWebhookEvent.create({ data: { id: eventId, type: eventType } }),
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
      data: { subscriptionStatus: "active" },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount: tier.creditsPerMonth,
        type: "SUBSCRIPTION",
        referenceId: subscription.id,
        note: `${tier.displayName} subscription — initial ${tier.creditsPerMonth} credits`,
      },
    }),
  ]);

  // Authoritative activation event — fired from the grant itself, not from a
  // success page the buyer may never see. After the transaction so a
  // redelivered event (P2002 rollback) never double-counts.
  trackSubscriptionActivatedServer({
    userId,
    plan: tier.name,
    provider: "stripe",
    lifetime: acquisitionSource === "vip-lifetime",
    source: acquisitionSource,
    via: "webhook",
  });

  // Server-side Meta CAPI Purchase — same exactly-once slot. The browser
  // pixel keys its Purchase on the checkout-session id (the success_url's
  // session_id param), so the SESSION id is the event_id here, not the
  // subscription id — dedup silently breaks otherwise. Browser match signals
  // come back from the metadata the checkout route stashed; the charged
  // amount (post-coupon, pre-anything-else the tier table doesn't know) is
  // the session's amount_total.
  metaCapiPurchase({
    userId,
    email: session.customer_details?.email ?? undefined,
    tier: tier.name,
    valueUsdCents: session.amount_total ?? tier.priceUsdCents,
    currency: session.currency,
    transactionId: session.id,
    // Stripe's collected billing details are the best identity source here —
    // an actual billing name + address, present even when the buyer never
    // filled their Greenroom profile.
    identity: capiIdentityFromProfile({
      fullName: session.customer_details?.name,
      city: session.customer_details?.address?.city,
      state: session.customer_details?.address?.state,
      postalCode: session.customer_details?.address?.postal_code,
    }),
    attribution: capiAttributionFromMetadata(session.metadata ?? undefined),
  });

  // A VIP activation is the trigger that pays out a pending referral — only for
  // a genuinely ACTIVE subscription. Idempotent and never throws — safe
  // alongside the reconcile cron / a redelivered event. Pass the subscription's
  // activation time so the reward window is measured against when VIP was
  // reached, not when this grant happens to run.
  await grantReferralRewardIfVip(
    userId,
    tier.name,
    subscription.status === "active",
    "webhook",
    new Date(subscription.created * 1000)
  );
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventId: string,
  eventType: string
) {
  // Skip the first invoice (handled by checkout.session.completed)
  if (invoice.billing_reason === "subscription_create") {
    return;
  }

  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!stripeCustomerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    include: { subscription: { include: { tier: true } } },
  });

  if (!user || !user.subscription) {
    console.error(
      `No user/subscription found for customer: ${stripeCustomerId}`
    );
    return;
  }

  // A late-retried Stripe event must not touch a row PayPal now owns.
  if (user.subscription.provider !== "stripe") {
    console.log(
      `Ignoring ${eventType} for user ${user.id} — subscription now owned by ${user.subscription.provider}`
    );
    return;
  }

  const tier = user.subscription.tier;
  const stripeSubId = user.subscription.stripeSubscriptionId;

  // Fetch subscription for updated period dates
  if (stripeSubId) {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const { periodStart, periodEnd } = getPeriodDates(stripeSub);

    await prisma.subscription.update({
      where: { userId: user.id },
      data: {
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  // Atomic: event marker + balance + subscription_status flag + transaction
  // must commit together (idempotency — see handleCreditPurchase).
  await prisma.$transaction([
    prisma.stripeWebhookEvent.create({ data: { id: eventId, type: eventType } }),
    prisma.creditBalance.upsert({
      where: { userId: user.id },
      update: { balance: { increment: tier.creditsPerMonth } },
      create: { userId: user.id, balance: tier.creditsPerMonth },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: "active" },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: tier.creditsPerMonth,
        type: "SUBSCRIPTION",
        referenceId: invoice.id,
        note: `${tier.displayName} renewal — ${tier.creditsPerMonth} credits`,
      },
    }),
  ]);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  eventId: string,
  eventType: string
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!stripeCustomerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    include: { subscription: { include: { tier: true } } },
  });

  if (!user || !user.subscription) return;

  // A late-retried Stripe event must not touch a row PayPal now owns.
  if (user.subscription.provider !== "stripe") return;

  const newPriceId = subscription.items.data[0]?.price.id;
  if (!newPriceId) return;

  // Env price map → stable tier name → DB row (same as handleCheckoutCompleted).
  const newTierName = tierNameForStripePrice(newPriceId);
  const newTier = newTierName
    ? await prisma.subscriptionTier.findFirst({
        where: { name: newTierName, isActive: true },
      })
    : null;

  if (!newTier) return;

  const oldTier = user.subscription.tier;
  const isUpgrade = newTier.creditsPerMonth > oldTier.creditsPerMonth;
  const { periodStart, periodEnd } = getPeriodDates(subscription);

  // Update the subscription record (no status — that lives on users.subscription_status).
  await prisma.subscription.update({
    where: { userId: user.id },
    data: {
      tierId: newTier.id,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // If upgrading, top up the difference in credits — atomically.
  if (isUpgrade) {
    const topUp = newTier.creditsPerMonth - oldTier.creditsPerMonth;

    await prisma.$transaction([
      prisma.stripeWebhookEvent.create({ data: { id: eventId, type: eventType } }),
      prisma.creditBalance.upsert({
        where: { userId: user.id },
        update: { balance: { increment: topUp } },
        create: { userId: user.id, balance: topUp },
      }),
      prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: topUp,
          type: "UPGRADE_TOPUP",
          referenceId: subscription.id,
          note: `Upgrade from ${oldTier.displayName} to ${newTier.displayName} — ${topUp} bonus credits`,
        },
      }),
    ]);
  }

  // A referred user who reaches VIP by UPGRADING (e.g. GA→VIP via the billing
  // portal) never hits handleCheckoutCompleted, so pay a pending referral here
  // too — but only if the sub is ACTIVE (a subscription.updated event can fire
  // for an incomplete / past_due / canceling sub, which must NOT pay). Idempotent
  // — a no-op for non-referrals / an already-rewarded referral / a non-VIP tier.
  await grantReferralRewardIfVip(
    user.id,
    newTier.name,
    subscription.status === "active",
    "webhook",
    new Date(subscription.created * 1000)
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!stripeCustomerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    include: { subscription: true },
  });

  if (!user) return;

  // A Stripe sub ending must not cancel a user whose current subscription is
  // PayPal's (e.g. they switched providers before the Stripe period lapsed).
  if (user.subscription && user.subscription.provider !== "stripe") return;

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: "canceled" },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!stripeCustomerId) return;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId },
    include: { subscription: true },
  });

  if (!user) return;

  // Same provider guard as handleSubscriptionDeleted.
  if (user.subscription && user.subscription.provider !== "stripe") return;

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: "past_due" },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // A missing secret is an OPS failure, not a bad request — distinguish it
  // loudly from a signature mismatch. Every event 400ing as "invalid
  // signature" because the env was unset is exactly the silent
  // paid-but-not-granted failure mode this endpoint has already suffered.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error(
      "STRIPE_WEBHOOK_SECRET is not set — refusing all Stripe webhook deliveries. " +
        "Payments are being taken WITHOUT granting subscriptions/credits until this is fixed."
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
          event.type
        );
        break;

      case "invoice.paid":
        await handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.id,
          event.type
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          event.id,
          event.type
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(
          event.data.object as Stripe.Invoice
        );
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    // A unique-violation on stripe_webhook_events means this event id was
    // already processed (Stripe redelivery). The grant rolled back, so it's
    // safe — ack with 200 so Stripe stops retrying.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      console.log(`Duplicate Stripe event ignored: ${event.id} (${event.type})`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.error(`Error handling ${event.type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

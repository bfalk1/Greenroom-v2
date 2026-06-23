import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
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
    console.error("No userId in checkout session metadata");
    return;
  }

  // Expand the subscription to get the price
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  const priceId = subscription.items.data[0]?.price.id;

  if (!priceId) {
    console.error("No priceId found on subscription");
    return;
  }

  // Find the matching tier
  const tier = await prisma.subscriptionTier.findFirst({
    where: { stripePriceId: priceId, isActive: true },
  });

  if (!tier) {
    console.error(`No tier found for priceId: ${priceId}`);
    return;
  }

  const { periodStart, periodEnd } = getPeriodDates(subscription);

  // Create or update subscription. Status lives on users.subscription_status
  // (single source of truth) — Subscription only stores tier/period/Stripe IDs.
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tierId: tier.id,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      tierId: tier.id,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  // Atomic: event marker + balance + subscription_status flag + transaction
  // must commit together (idempotency — see handleCreditPurchase).
  await prisma.$transaction([
    prisma.stripeWebhookEvent.create({ data: { id: eventId, type: eventType } }),
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

  const newPriceId = subscription.items.data[0]?.price.id;
  if (!newPriceId) return;

  const newTier = await prisma.subscriptionTier.findFirst({
    where: { stripePriceId: newPriceId, isActive: true },
  });

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
  });

  if (!user) return;

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
  });

  if (!user) return;

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

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
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

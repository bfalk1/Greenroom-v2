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

async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const credits = parseInt(session.metadata?.credits || "0", 10);

  if (!userId || !credits) {
    console.error("Missing userId or credits in credit purchase metadata");
    return;
  }

  // Add credits to balance
  await prisma.creditBalance.upsert({
    where: { userId },
    update: { balance: { increment: credits } },
    create: { userId, balance: credits },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { credits: { increment: credits } },
  });

  // Log transaction
  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: credits,
      type: "PURCHASE",
      referenceId: session.id,
      note: `Purchased ${credits} credits`,
    },
  });

  console.log(`Issued ${credits} credits to user ${userId} (one-time purchase)`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Handle one-time credit purchases separately
  if (session.metadata?.type === "credit_purchase") {
    return handleCreditPurchase(session);
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

  // Create or update subscription
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tierId: tier.id,
      stripeSubscriptionId: subscription.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      tierId: tier.id,
      stripeSubscriptionId: subscription.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  // Create or update credit balance and issue credits
  await prisma.creditBalance.upsert({
    where: { userId },
    update: { balance: { increment: tier.creditsPerMonth } },
    create: { userId, balance: tier.creditsPerMonth },
  });

  // Update user credits and subscription status
  await prisma.user.update({
    where: { id: userId },
    data: {
      credits: { increment: tier.creditsPerMonth },
      subscriptionStatus: "active",
    },
  });

  // Log the credit transaction
  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: tier.creditsPerMonth,
      type: "SUBSCRIPTION",
      referenceId: subscription.id,
      note: `${tier.displayName} subscription — initial ${tier.creditsPerMonth} credits`,
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
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
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  // Issue renewal credits
  await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: { balance: { increment: tier.creditsPerMonth } },
    create: { userId: user.id, balance: tier.creditsPerMonth },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      credits: { increment: tier.creditsPerMonth },
      subscriptionStatus: "active",
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      amount: tier.creditsPerMonth,
      type: "SUBSCRIPTION",
      referenceId: invoice.id,
      note: `${tier.displayName} renewal — ${tier.creditsPerMonth} credits`,
    },
  });
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
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

  // Update the subscription record
  await prisma.subscription.update({
    where: { userId: user.id },
    data: {
      tierId: newTier.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // If upgrading, top up the difference in credits
  if (isUpgrade) {
    const topUp = newTier.creditsPerMonth - oldTier.creditsPerMonth;

    await prisma.creditBalance.upsert({
      where: { userId: user.id },
      update: { balance: { increment: topUp } },
      create: { userId: user.id, balance: topUp },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { increment: topUp } },
    });

    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: topUp,
        type: "UPGRADE_TOPUP",
        referenceId: subscription.id,
        note: `Upgrade from ${oldTier.displayName} to ${newTier.displayName} — ${topUp} bonus credits`,
      },
    });
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

  await prisma.subscription.updateMany({
    where: { userId: user.id },
    data: { status: "CANCELED" },
  });

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

  await prisma.subscription.updateMany({
    where: { userId: user.id },
    data: { status: "PAST_DUE" },
  });

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
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
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
    console.error(`Error handling ${event.type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

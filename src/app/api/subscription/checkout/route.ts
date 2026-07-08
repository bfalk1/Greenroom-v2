import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { stripeTaxCheckoutParams } from "@/lib/stripe/config";
import { VIP_OFFER_COOKIE, vipLifetimeCouponId, verifyVipUnlock } from "@/lib/vipOffer";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId, lifetime } = await request.json();

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing priceId" },
        { status: 400 }
      );
    }

    // Only allow checkout against a priceId that maps to an active tier. This is
    // the SAME lookup the Stripe webhook uses to grant the subscription + credits
    // (see handleCheckoutCompleted), so accepting anything else would let a user
    // subscribe at an off-list/legacy/test price that the webhook can't resolve —
    // leaving a live Stripe subscription with no Greenroom record.
    const tier = await prisma.subscriptionTier.findFirst({
      where: { stripePriceId: priceId, isActive: true },
      select: { id: true, name: true },
    });

    if (!tier) {
      return NextResponse.json(
        { error: "Invalid subscription plan" },
        { status: 400 }
      );
    }

    // Lifetime VIP offer (returning-subscriber /vip page). The discount is a
    // Stripe coupon applied here on the server — NEVER trust the client flag
    // alone. To qualify, ALL must hold: the request asked for lifetime, this
    // browser unlocked the offer via the password gate (httpOnly cookie set by
    // /api/vip-offer), the plan is VIP (the only tier it covers), and the coupon
    // is configured. If lifetime was requested but any check fails, refuse
    // rather than silently charging full price.
    let discountCoupon: string | null = null;
    if (lifetime === true) {
      const store = await cookies();
      const unlocked = verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value);
      const coupon = vipLifetimeCouponId();

      if (!unlocked) {
        return NextResponse.json(
          { error: "Lifetime offer is locked. Enter the access code first." },
          { status: 403 }
        );
      }
      if (tier.name !== "VIP") {
        return NextResponse.json(
          { error: "The lifetime discount applies to the VIP plan only." },
          { status: 400 }
        );
      }
      if (!coupon) {
        console.error(
          "Lifetime VIP checkout requested but STRIPE_VIP_LIFETIME_COUPON_ID is not set"
        );
        return NextResponse.json(
          { error: "Lifetime offer is temporarily unavailable." },
          { status: 503 }
        );
      }
      discountCoupon = coupon;
    }

    // Find or create the user in our DB
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Cross-provider guard: a live PayPal subscription must not be joined by
    // a Stripe one — the user would be double-billed and the two providers'
    // webhooks would fight over the single Subscription row. PayPal plan
    // changes go through /api/subscription/revise-paypal.
    if (
      dbUser.subscriptionStatus === "active" ||
      dbUser.subscriptionStatus === "past_due"
    ) {
      const existingSub = await prisma.subscription.findUnique({
        where: { userId: dbUser.id },
        select: { provider: true },
      });
      if (existingSub?.provider === "paypal") {
        return NextResponse.json(
          {
            error:
              "Your current subscription is billed through PayPal — change or cancel it from your account page first",
          },
          { status: 409 }
        );
      }
    }

    // The lifetime offer is for NEW accounts only — anyone who has ever
    // subscribed (currently active/past_due, or a prior/cancelled subscription)
    // is ineligible. Enforced server-side so a direct API call can't bypass the
    // client gate; also prevents a Stripe second-concurrent-subscription
    // double-bill. New account = no Subscription row AND no subscription status.
    if (discountCoupon) {
      const priorSub = await prisma.subscription.findUnique({
        where: { userId: dbUser.id },
        select: { id: true },
      });
      const hasSubscriptionHistory =
        priorSub != null ||
        (dbUser.subscriptionStatus != null &&
          dbUser.subscriptionStatus !== "none");
      if (hasSubscriptionHistory) {
        return NextResponse.json(
          { error: "The lifetime offer is for new accounts only." },
          { status: 409 }
        );
      }
    }

    // Find or create Stripe customer
    let stripeCustomerId = dbUser.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email,
        metadata: { userId: dbUser.id },
      });
      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId },
      });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Stripe Checkout Session. stripeTaxCheckoutParams() adds
    // location-based tax (exclusive — added on top) only when NEXT_PUBLIC_TAX_ENABLED
    // is set — an inert no-op otherwise, so this doesn't affect live checkout
    // until the Stripe Tax dashboard config is in place.
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: dbUser.id },
      // Coupon (lifetime VIP) + tax coexist: Stripe applies exclusive tax on
      // the post-discount amount, which is the correct base.
      ...(discountCoupon ? { discounts: [{ coupon: discountCoupon }] } : {}),
      ...stripeTaxCheckoutParams(),
      success_url: `${appUrl}/pricing?success=true`,
      cancel_url: discountCoupon
        ? `${appUrl}/vip?canceled=true`
        : `${appUrl}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

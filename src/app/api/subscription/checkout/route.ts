import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { stripeTaxCheckoutParams, tierNameForStripePrice } from "@/lib/stripe/config";
import { VIP_OFFER_COOKIE, vipLifetimeCouponId, verifyVipUnlock } from "@/lib/vipOffer";
import { isLifetimeEligible } from "@/lib/lifetimeEligibility";

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

    // Only allow checkout against a priceId that maps to an active tier. The
    // price→tier mapping comes from env (tierNameForStripePrice); we then confirm
    // the tier is active in our DB by its stable name. This is the SAME
    // resolution the Stripe webhook uses to grant the subscription + credits (see
    // handleCheckoutCompleted), so accepting anything else would let a user
    // subscribe at an off-list/legacy/test price that the webhook can't resolve —
    // leaving a live Stripe subscription with no Greenroom record.
    const tierName = tierNameForStripePrice(priceId);
    const tier = tierName
      ? await prisma.subscriptionTier.findFirst({
          where: { name: tierName, isActive: true },
          select: { id: true, name: true },
        })
      : null;

    if (!tier) {
      return NextResponse.json(
        { error: "Invalid subscription plan" },
        { status: 400 }
      );
    }

    // Find or create the user in our DB (fetched before the lifetime gate so a
    // referral-granted account unlock can authorize the discount).
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Lifetime VIP offer (returning-subscriber /vip page, or a creator-referred
    // account). The discount is a Stripe coupon applied here on the server —
    // NEVER trust the client flag alone. To qualify, ALL must hold: the request
    // asked for lifetime, the offer is unlocked (either this browser cleared the
    // password gate — httpOnly cookie set by /api/vip-offer — OR the account was
    // granted the VIP offer via a creator referral), the plan is VIP (the only
    // tier it covers), and the coupon is configured. Otherwise refuse rather
    // than silently charging full price.
    let discountCoupon: string | null = null;
    if (lifetime === true) {
      const store = await cookies();
      const unlocked =
        verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value) ||
        dbUser.vipOfferUnlockedAt != null;
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

    // The lifetime offer is for accounts that have never PAID — a
    // provider-backed subscription row disqualifies; beta comps (flag only, no
    // row) stay eligible. Shared rule with /api/user/subscription via
    // isLifetimeEligible so the UI's verdict always matches this enforcement.
    // Enforced server-side so a direct API call can't bypass the client gate.
    if (discountCoupon && !(await isLifetimeEligible(dbUser.id))) {
      return NextResponse.json(
        {
          error:
            "The lifetime offer is for members without a prior paid subscription.",
        },
        { status: 409 }
      );
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
      (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

    // Create Stripe Checkout Session. stripeTaxCheckoutParams() adds
    // location-based tax (exclusive — added on top) only when NEXT_PUBLIC_TAX_ENABLED
    // is set — an inert no-op otherwise, so this doesn't affect live checkout
    // until the Stripe Tax dashboard config is in place.
    // Attribution rides on BOTH the session metadata (what the webhook's
    // checkout.session.completed handler reads) and the subscription's own
    // metadata (survives if the sub is ever re-linked outside the session).
    const acquisitionSource = discountCoupon ? "vip-lifetime" : null;
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: dbUser.id,
        ...(acquisitionSource ? { acquisitionSource } : {}),
      },
      subscription_data: {
        metadata: {
          userId: dbUser.id,
          ...(acquisitionSource ? { acquisitionSource } : {}),
        },
      },
      // Coupon (lifetime VIP) + tax coexist: Stripe applies exclusive tax on
      // the post-discount amount, which is the correct base.
      ...(discountCoupon ? { discounts: [{ coupon: discountCoupon }] } : {}),
      ...stripeTaxCheckoutParams(),
      success_url: `${appUrl}/checkout/complete?provider=stripe&tier=${encodeURIComponent(tier.name)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: discountCoupon
        ? `${appUrl}/vip?canceled=true`
        : `${appUrl}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    // Stripe config errors deserve distinct, actionable responses: an expired
    // lifetime coupon or a bad/archived price ID looks like a permanent
    // "try again" to the buyer but is really an ops problem — this is exactly
    // how the July 2026 expired-coupon outage stayed invisible.
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      console.error("Stripe checkout config error:", {
        code: error.code,
        param: error.param,
        message: error.message,
      });
      if (error.code === "coupon_expired") {
        return NextResponse.json(
          {
            error:
              "The lifetime discount is temporarily misconfigured — nothing was charged. We're on it; please try again later.",
          },
          { status: 503 }
        );
      }
      if (error.code === "resource_missing") {
        return NextResponse.json(
          {
            error:
              "This plan is temporarily misconfigured — nothing was charged. We're on it; please try again later.",
          },
          { status: 503 }
        );
      }
    }
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

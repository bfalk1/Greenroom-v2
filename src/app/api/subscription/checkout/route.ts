import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
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
    // alone. To qualify, ALL must hold:
    //   1. the request asked for the lifetime price,
    //   2. this browser unlocked the offer via the password gate (httpOnly
    //      cookie set by /api/vip-offer — same cookie, see src/lib/vipOffer.ts),
    //   3. the plan is actually VIP (the only tier the offer covers), and
    //   4. the coupon is configured in Stripe.
    // If lifetime was requested but any check fails, we refuse rather than
    // silently charging full price — the user expects the discounted rate, so a
    // surprise full charge is worse than a clear error they can act on.
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
        console.error("Lifetime VIP checkout requested but STRIPE_VIP_LIFETIME_COUPON_ID is not set");
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

    // Create Stripe Checkout Session. A lifetime-VIP checkout carries the coupon
    // (recurring discount for the life of the subscription) and returns the user
    // to /vip on cancel so they can retry the offer; everything else uses the
    // standard pricing-page return.
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: dbUser.id },
      ...(discountCoupon ? { discounts: [{ coupon: discountCoupon }] } : {}),
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

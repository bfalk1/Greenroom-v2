import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isPaypalConfigured } from "@/lib/paypal/client";
import {
  createPaypalSubscription,
  paypalPlanIdForTier,
  paypalVipLifetimePlanId,
  paypalSubscriptionsConfigured,
} from "@/lib/paypal/subscriptions";
import { canadaTaxPercent, taxCollectionEnabled } from "@/lib/tax/canadaRates";
import { VIP_OFFER_COOKIE, verifyVipUnlock } from "@/lib/vipOffer";
import { cookies } from "next/headers";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    if (!isPaypalConfigured() || !paypalSubscriptionsConfigured()) {
      return NextResponse.json(
        { error: "PayPal is not available" },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = await rateLimit(`paypal-sub:${user.id}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!limit.success) {
      return tooManyRequests();
    }

    const { tierName, country, region, lifetime } = await request.json();

    // Same guard as Stripe checkout: only active tiers, and the plan id must
    // come from our env mapping — never from the client.
    const tier = await prisma.subscriptionTier.findFirst({
      where: { name: tierName, isActive: true },
      select: { id: true, name: true },
    });
    let planId = tier ? paypalPlanIdForTier(tier.name) : null;

    if (!tier || !planId) {
      return NextResponse.json(
        { error: "Invalid subscription plan" },
        { status: 400 }
      );
    }

    // Lifetime VIP offer — swap in the discounted PayPal plan, gated the SAME
    // way as the Stripe path: the offer must be unlocked (httpOnly cookie set by
    // /api/vip-offer), the tier must be VIP, and the discounted plan must be
    // configured. Fail closed rather than billing the full price on a mismatch.
    let isLifetime = false;
    if (lifetime === true) {
      const store = await cookies();
      const unlocked = verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value);
      const lifetimePlan = paypalVipLifetimePlanId();

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
      if (!lifetimePlan) {
        console.error(
          "Lifetime VIP PayPal checkout requested but PAYPAL_VIP_LIFETIME_PLAN_ID is not set"
        );
        return NextResponse.json(
          { error: "Lifetime offer is temporarily unavailable." },
          { status: 503 }
        );
      }
      planId = lifetimePlan;
      isLifetime = true;
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // One subscription per user across BOTH providers. An existing Stripe sub
    // is managed via the Stripe portal; an existing PayPal sub via revise.
    if (
      dbUser.subscriptionStatus === "active" ||
      dbUser.subscriptionStatus === "past_due"
    ) {
      return NextResponse.json(
        { error: "You already have a subscription — manage it from your account page" },
        { status: 409 }
      );
    }

    // The lifetime offer is for NEW accounts only — anyone who has EVER
    // subscribed (a prior/cancelled subscription, or any non-empty status) is
    // ineligible. The active/past_due case is already handled above; this also
    // blocks churned users. Enforced server-side so a direct API call can't
    // bypass the client gate.
    if (isLifetime) {
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

    // Location-based tax, added on top (exclusive). The rate is ALWAYS computed
    // here from the buyer's declared country/region — never accepted from the
    // client — so a tampered request can't lower its own tax. Inert (0%) unless
    // tax collection is enabled; non-Canada is a zero-rated export (0%).
    const taxPercent = taxCollectionEnabled()
      ? canadaTaxPercent(country, region)
      : 0;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";

    const subscription = await createPaypalSubscription({
      planId,
      userId: dbUser.id,
      taxPercent,
      returnUrl: `${appUrl}/api/subscription/checkout-paypal/return`,
      cancelUrl: isLifetime
        ? `${appUrl}/vip?canceled=true`
        : `${appUrl}/pricing?canceled=true`,
    });

    if (!subscription.approveUrl) {
      console.error(`PayPal subscription ${subscription.id} has no approve link`);
      return NextResponse.json(
        { error: "Failed to create PayPal checkout" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: subscription.approveUrl });
  } catch (error) {
    console.error("Error creating PayPal subscription checkout:", error);
    return NextResponse.json(
      { error: "Failed to create PayPal checkout" },
      { status: 500 }
    );
  }
}

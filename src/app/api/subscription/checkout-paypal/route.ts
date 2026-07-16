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
import { resolveCanadaTax, taxCollectionEnabled } from "@/lib/tax/canadaRates";
import { VIP_OFFER_COOKIE, verifyVipUnlock } from "@/lib/vipOffer";
import { cookies } from "next/headers";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { isLifetimeEligible } from "@/lib/lifetimeEligibility";

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

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Lifetime VIP offer — swap in the discounted PayPal plan, gated the SAME
    // way as the Stripe path: the offer must be unlocked (either the httpOnly
    // cookie set by /api/vip-offer OR a creator-referral account grant), the
    // tier must be VIP, and the discounted plan must be configured. Fail closed
    // rather than billing the full price on a mismatch.
    let isLifetime = false;
    if (lifetime === true) {
      const store = await cookies();
      const unlocked =
        verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value) ||
        dbUser.vipOfferUnlockedAt != null;
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

    // One subscription per user across BOTH providers. An existing Stripe sub
    // is managed via the Stripe portal; an existing PayPal sub via revise.
    // The guard requires a PROVIDER-BACKED row, not just the status flag: beta
    // comps carry subscription_status="active" with no subscription row at
    // all, and blocking them here would contradict the lifetime offer they
    // were just shown (they're "never PAID" and fully eligible to buy).
    if (
      dbUser.subscriptionStatus === "active" ||
      dbUser.subscriptionStatus === "past_due"
    ) {
      const existingSub = await prisma.subscription.findUnique({
        where: { userId: dbUser.id },
        select: { stripeSubscriptionId: true, paypalSubscriptionId: true },
      });
      if (
        existingSub &&
        (existingSub.stripeSubscriptionId || existingSub.paypalSubscriptionId)
      ) {
        return NextResponse.json(
          { error: "You already have a subscription — manage it from your account page" },
          { status: 409 }
        );
      }
    }

    // The lifetime offer is for accounts that have never PAID — a
    // provider-backed subscription row disqualifies; beta comps (flag only, no
    // row) stay eligible. The active/past_due case is already handled above.
    // Shared rule with /api/user/subscription and the Stripe checkout route
    // via isLifetimeEligible; enforced server-side so a direct API call can't
    // bypass the client gate.
    if (isLifetime && !(await isLifetimeEligible(dbUser.id))) {
      return NextResponse.json(
        {
          error:
            "The lifetime offer is for members without a prior paid subscription.",
        },
        { status: 409 }
      );
    }

    // Location-based tax, added on top (exclusive). The rate is resolved from TWO
    // indicators — the buyer's declared country/region AND their IP-geolocated
    // country/region from Vercel's edge headers — never from a client-sent amount.
    // Using a second indicator the buyer can't set on the form (IP) both satisfies
    // the CRA two-indicator rule and closes the evasion gap: declaring a tax-free
    // country while connecting from Canada still resolves to Canadian tax. The
    // x-vercel-ip-* headers are set by Vercel's edge (client-supplied copies are
    // stripped) and are absent in local dev, where we fall back to the declared
    // indicator alone. Inert (0%) unless tax collection is enabled.
    let taxPercent = 0;
    if (taxCollectionEnabled()) {
      const resolved = resolveCanadaTax({
        declaredCountry: country,
        declaredRegion: region,
        ipCountry: request.headers.get("x-vercel-ip-country"),
        ipRegion: request.headers.get("x-vercel-ip-country-region"),
      });
      taxPercent = resolved.percent;

      // Audit evidence: the CRA test grades a vendor on the indicators obtained in
      // the ordinary course and RETAINED, so record the full basis + both signals.
      // NOTE: a log line is not durable retention — persisting this per subscription
      // is a tracked follow-up before tax collection is enabled in production.
      console.log(
        `[tax] paypal sub user=${user.id} charge=${taxPercent}% ` +
          `basis=${resolved.basis} conflict=${resolved.conflict} ` +
          `declared=${resolved.indicators.declaredCountry || "-"}/${resolved.indicators.declaredRegion || "-"} ` +
          `ip=${resolved.indicators.ipCountry || "-"}/${resolved.indicators.ipRegion || "-"}`
      );
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm").trim();

    const subscription = await createPaypalSubscription({
      planId,
      userId: dbUser.id,
      taxPercent,
      // lifetime=1 tells the return route where "cancel/back out" should land
      // (back on the offer, not full-price /pricing). PayPal appends its own
      // params (subscription_id, ba_token) to whatever query is here.
      returnUrl: `${appUrl}/api/subscription/checkout-paypal/return${
        isLifetime ? "?lifetime=1" : ""
      }`,
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

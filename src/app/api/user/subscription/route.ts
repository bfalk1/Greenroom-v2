import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  VIP_LIFETIME_OFFER,
  VIP_FIRST_MONTH_OFFER,
  PUBLIC_SUBSCRIPTION_PACKAGES,
} from "@/lib/stripe/publicPriceConfig";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [subscription, dbUser] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId: user.id },
        include: { tier: true },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { subscriptionStatus: true },
      }),
    ]);

    // Lifetime-offer eligibility (never PAID): no provider-backed subscription
    // row. Computed here — from the row already loaded — so the checkout UI
    // shows the same verdict the checkout APIs enforce (they share the rule
    // via src/lib/lifetimeEligibility.ts). Beta comps have no row at all and
    // stay eligible.
    const lifetimeEligible =
      !subscription ||
      (!subscription.stripeSubscriptionId &&
        !subscription.paypalSubscriptionId);

    if (!subscription) {
      return NextResponse.json({ subscription: null, lifetimeEligible });
    }

    // Annual subs are recognized by their period span — the row stores no
    // interval column, and a billing period is either ~1 month (< 32 days) or
    // ~1 year, so a 300-day threshold can't misclassify either.
    const isAnnual =
      subscription.currentPeriodEnd.getTime() -
        subscription.currentPeriodStart.getTime() >
      1000 * 60 * 60 * 24 * 300;
    const annualPriceUsd = PUBLIC_SUBSCRIPTION_PACKAGES.find(
      (p) => p.tierName === subscription.tier.name
    )?.annualPrice;

    return NextResponse.json({
      lifetimeEligible,
      subscription: {
        tierName: subscription.tier.name,
        tierDisplayName: subscription.tier.displayName,
        provider: subscription.provider,
        // Status reads from users.subscription_status (single source of truth);
        // uppercased here for the existing UI badge that compares ACTIVE/PAST_DUE/CANCELED.
        status: (dbUser?.subscriptionStatus ?? "none").toUpperCase(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        creditsPerMonth: subscription.tier.creditsPerMonth,
        // Tier LIST price (display and legacy consumers).
        priceUsdCents: subscription.tier.priceUsdCents,
        // Billing cycle length — "year" for annual subs (span heuristic
        // above). Lets the UI label the price correctly.
        billingInterval: isAnnual ? "year" : "month",
        // What the buyer is actually CHARGED — feeds the Meta Pixel Purchase
        // value on /checkout/complete so the browser and Conversions API
        // sides of a deduplicated Purchase report the same amount no matter
        // which one Meta keeps. The discounted offers and annual billing
        // diverge from monthly list; their charged prices live in the
        // provider config, mirrored by the display constants. (The Purchase
        // fires once, at activation — for the first-month offer that's the
        // $5.99 cycle; renewals emit no Purchase, so the intro price is the
        // right value here. The offers are monthly-only, so the order of
        // these branches never collides with annual.)
        chargedUsdCents:
          subscription.acquisitionSource === "vip-lifetime"
            ? Math.round(VIP_LIFETIME_OFFER.lifetimePrice * 100)
            : subscription.acquisitionSource === "vip-first-month"
              ? Math.round(VIP_FIRST_MONTH_OFFER.firstMonthPrice * 100)
              : isAnnual
                ? Math.round(
                    (annualPriceUsd ??
                      (subscription.tier.priceUsdCents / 100) * 12) * 100
                  )
                : subscription.tier.priceUsdCents,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

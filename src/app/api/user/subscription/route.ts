import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { VIP_LIFETIME_OFFER } from "@/lib/stripe/publicPriceConfig";

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
        // What the buyer is actually CHARGED — feeds the Meta Pixel Purchase
        // value on /checkout/complete so the browser and Conversions API
        // sides of a deduplicated Purchase report the same amount no matter
        // which one Meta keeps. Only the vip-lifetime discount diverges from
        // list; its charged price lives in the provider config, mirrored by
        // the display constant.
        chargedUsdCents:
          subscription.acquisitionSource === "vip-lifetime"
            ? Math.round(VIP_LIFETIME_OFFER.lifetimePrice * 100)
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

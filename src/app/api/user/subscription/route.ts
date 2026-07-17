import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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
        // Tier LIST price — feeds the Meta Pixel Purchase value on
        // /checkout/complete. Discounted subs (vip-lifetime) report list
        // price; ad traffic never hits the password-gated /vip funnel, so
        // ROAS math stays honest where it matters.
        priceUsdCents: subscription.tier.priceUsdCents,
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

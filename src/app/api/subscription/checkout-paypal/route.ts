import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isPaypalConfigured } from "@/lib/paypal/client";
import {
  createPaypalSubscription,
  paypalPlanIdForTier,
  paypalSubscriptionsConfigured,
} from "@/lib/paypal/subscriptions";
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

    const { tierName } = await request.json();

    // Same guard as Stripe checkout: only active tiers, and the plan id must
    // come from our env mapping — never from the client.
    const tier = await prisma.subscriptionTier.findFirst({
      where: { name: tierName, isActive: true },
      select: { id: true, name: true },
    });
    const planId = tier ? paypalPlanIdForTier(tier.name) : null;

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";

    const subscription = await createPaypalSubscription({
      planId,
      userId: dbUser.id,
      returnUrl: `${appUrl}/api/subscription/checkout-paypal/return`,
      cancelUrl: `${appUrl}/pricing?canceled=true`,
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

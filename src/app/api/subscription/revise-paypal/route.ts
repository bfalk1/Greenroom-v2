import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isPaypalConfigured } from "@/lib/paypal/client";
import {
  paypalPlanIdForTier,
  revisePaypalSubscription,
} from "@/lib/paypal/subscriptions";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// Switch an active PayPal subscription to a different tier. PayPal requires
// buyer re-approval for plan changes, so this returns an approve URL; the
// BILLING.SUBSCRIPTION.UPDATED webhook syncs the tier once the buyer
// confirms. No credits move at revision time — the next PAYMENT.SALE.COMPLETED
// grants the new tier's full amount.
export async function POST(request: Request) {
  try {
    if (!isPaypalConfigured()) {
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

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (
      !subscription ||
      subscription.provider !== "paypal" ||
      !subscription.paypalSubscriptionId
    ) {
      return NextResponse.json(
        { error: "No PayPal subscription found" },
        { status: 400 }
      );
    }

    if (subscription.tierId === tier.id) {
      return NextResponse.json(
        { error: "You are already on this plan" },
        { status: 400 }
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "This subscription is already canceling" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";

    const { approveUrl } = await revisePaypalSubscription({
      subscriptionId: subscription.paypalSubscriptionId,
      planId,
      returnUrl: `${appUrl}/pricing?paypal_revised=true`,
      cancelUrl: `${appUrl}/pricing?canceled=true`,
    });

    if (!approveUrl) {
      return NextResponse.json(
        { error: "Failed to start plan change" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: approveUrl });
  } catch (error) {
    console.error("Error revising PayPal subscription:", error);
    return NextResponse.json(
      { error: "Failed to change plan" },
      { status: 500 }
    );
  }
}

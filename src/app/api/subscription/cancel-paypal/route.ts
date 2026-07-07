import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isPaypalConfigured } from "@/lib/paypal/client";
import { cancelPaypalSubscription } from "@/lib/paypal/subscriptions";

// Cancels the user's PayPal subscription. PayPal cancellation is immediate
// and permanent (no more billing), but the buyer paid through the period —
// so we only flag cancelAtPeriodEnd here and the daily cron flips the user
// to canceled once currentPeriodEnd passes.
export async function POST() {
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

    // No cancelAtPeriodEnd early-return: always tell PayPal (it treats an
    // already-cancelled sub as success), so a past_due user cancelling mid-
    // dunning genuinely stops PayPal's payment retries.
    await cancelPaypalSubscription(
      subscription.paypalSubscriptionId,
      "Customer canceled from account page"
    );

    await prisma.subscription.update({
      where: { userId: user.id },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error canceling PayPal subscription:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}

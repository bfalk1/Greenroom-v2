import { NextResponse } from "next/server";
import { isPaypalConfigured } from "@/lib/paypal/client";
import { activatePaypalSubscription } from "@/lib/paypal/subscriptions";

export const dynamic = "force-dynamic";

// PayPal redirects the buyer here after approving the subscription
// (?subscription_id=...). Like the credit-pack return route this is public
// and session-independent: attribution comes from the subscription's
// custom_id, and the SALE webhook backstops everything done here.
export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";
  const redirect = (params: string) =>
    NextResponse.redirect(`${appUrl}/pricing?${params}`);

  try {
    if (!isPaypalConfigured()) {
      return redirect("paypal_error=true");
    }

    const subscriptionId = new URL(request.url).searchParams.get(
      "subscription_id"
    );

    if (!subscriptionId) {
      return redirect("canceled=true");
    }

    const result = await activatePaypalSubscription(subscriptionId);

    if (result === "active") {
      return redirect("success=true");
    }

    if (result === "pending") {
      // Approved but PayPal hasn't flipped it ACTIVE yet — the ACTIVATED
      // webhook finishes the job within moments.
      return redirect("paypal_pending=true");
    }

    return redirect("paypal_error=true");
  } catch (error) {
    console.error("Error completing PayPal subscription:", error);
    return redirect("paypal_error=true");
  }
}

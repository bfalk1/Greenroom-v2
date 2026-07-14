import { NextResponse } from "next/server";
import { isPaypalConfigured } from "@/lib/paypal/client";
import { activatePaypalSubscription } from "@/lib/paypal/subscriptions";

export const dynamic = "force-dynamic";

// PayPal redirects the buyer here after approving the subscription
// (?subscription_id=...). Like the credit-pack return route this is public
// and session-independent: attribution comes from the subscription's
// custom_id, and the SALE webhook backstops everything done here.
//
// Buyers land on /checkout/complete, which VERIFIES the subscription row
// before celebrating — never a success banner driven by a URL param alone
// (that pattern told the July 2026 incident's victims their credits were
// ready while the webhook was failing).
export async function GET(request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm").trim();
  const complete = (status: string) =>
    NextResponse.redirect(
      `${appUrl}/checkout/complete?provider=paypal&status=${status}`
    );

  try {
    if (!isPaypalConfigured()) {
      return complete("error");
    }

    const params = new URL(request.url).searchParams;
    const subscriptionId = params.get("subscription_id");

    if (!subscriptionId) {
      // Buyer backed out on PayPal — not a payment outcome. A lifetime buyer
      // goes back to the offer, not to the full-price grid.
      return NextResponse.redirect(
        params.get("lifetime") === "1"
          ? `${appUrl}/vip?canceled=true`
          : `${appUrl}/pricing?canceled=true`
      );
    }

    const result = await activatePaypalSubscription(subscriptionId, "return");

    if (result === "active") {
      return complete("active");
    }

    if (result === "pending") {
      // Approved but PayPal hasn't flipped it ACTIVE yet — the ACTIVATED
      // webhook finishes the job within moments; /checkout/complete polls
      // until the row appears.
      return complete("pending");
    }

    return complete("error");
  } catch (error) {
    console.error("Error completing PayPal subscription:", error);
    return complete("error");
  }
}

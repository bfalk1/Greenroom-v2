import { prisma } from "@/lib/prisma";
import { capturePaypalOrder, isPaypalConfigured } from "@/lib/paypal/client";
import { settlePaypalOrder } from "@/lib/paypal/settle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PayPal redirects the buyer here after approval (?token=<orderId>). Capture
// the payment and grant credits, then land the user back on the account page.
// The grant is keyed to the stored order row, not the session, so a dropped
// cookie can't orphan a paid order — and the webhook backstops this route.
export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";
  const redirect = (params: string) =>
    NextResponse.redirect(`${appUrl}/account?${params}`);

  try {
    if (!isPaypalConfigured()) {
      return redirect("credits_error=true");
    }

    const orderId = new URL(request.url).searchParams.get("token");

    if (!orderId) {
      return redirect("credits_canceled=true");
    }

    const order = await prisma.paypalOrder.findUnique({
      where: { id: orderId },
    });

    // Never capture orders we didn't create.
    if (!order) {
      return redirect("credits_error=true");
    }

    // Refreshing the return URL after the webhook already settled it.
    if (order.status === "COMPLETED") {
      return redirect("credits_purchased=true");
    }

    const captured = await capturePaypalOrder(orderId);

    if (captured.captureId) {
      const result = await settlePaypalOrder({
        orderId,
        captureId: captured.captureId,
        capturedUsdCents: captured.capturedUsdCents,
      });

      if (result === "settled" || result === "already_settled") {
        return redirect("credits_purchased=true");
      }

      return redirect("credits_error=true");
    }

    // Order captured but funds not settled yet (e.g. eCheck) — the
    // PAYMENT.CAPTURE.COMPLETED webhook grants when the money clears. Store
    // the pending capture id so that event can be correlated to this order.
    if (captured.pendingCaptureId) {
      await prisma.paypalOrder.updateMany({
        where: { id: orderId, captureId: null },
        data: { captureId: captured.pendingCaptureId },
      });
    }

    if (captured.status === "COMPLETED") {
      return redirect("credits_pending=true");
    }

    return redirect("credits_error=true");
  } catch (error) {
    console.error("Error completing PayPal credit purchase:", error);
    return redirect("credits_error=true");
  }
}

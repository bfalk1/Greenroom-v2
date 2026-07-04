import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  capturePaypalOrder,
  isPaypalConfigured,
  PaypalCaptureError,
  verifyPaypalWebhook,
} from "@/lib/paypal/client";
import {
  denyPaypalOrder,
  refundPaypalOrder,
  settlePaypalOrder,
} from "@/lib/paypal/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
    links?: { rel: string; href: string }[];
  };
}

// A capture's "up" link points at its order; a refund's "up" link points at
// its capture. Fallback correlation when the direct ids aren't on the event.
function idFromUpLink(
  resource: PaypalWebhookEvent["resource"],
  pathSegment: "orders" | "captures"
): string | null {
  const href = resource?.links?.find((l) => l.rel === "up")?.href;
  const match = href?.match(new RegExp(`/${pathSegment}/([A-Za-z0-9-]+)`));
  return match?.[1] ?? null;
}

// Backstop for buyers who approve on PayPal but never hit our return route
// (closed tab), for captures that settle later (eCheck), and for refunds and
// denials. Settlement is idempotent, so overlap with the return route is safe.
export async function POST(request: Request) {
  if (!isPaypalConfigured()) {
    return NextResponse.json(
      { error: "PayPal is not configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();

  let event: PaypalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaypalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifyPaypalWebhook({
    headers: request.headers,
    rawBody,
  });

  if (!verified) {
    console.error("PayPal webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.event_type) {
      case "CHECKOUT.ORDER.APPROVED": {
        const orderId = event.resource?.id;
        if (!orderId) break;

        // Only capture orders we created and haven't settled.
        const order = await prisma.paypalOrder.findUnique({
          where: { id: orderId },
        });

        if (!order || order.status !== "CREATED") break;

        let captured;
        try {
          captured = await capturePaypalOrder(orderId);
        } catch (error) {
          // Declines and other unfixable captures must be acked, or PayPal
          // redelivers the event forever. Transient errors still 500 → retry.
          if (error instanceof PaypalCaptureError && error.terminal) {
            console.error(
              `PayPal order ${orderId}: terminal capture failure — ${error.message}`
            );
            break;
          }
          throw error;
        }

        if (captured.captureId) {
          await settlePaypalOrder({
            orderId,
            captureId: captured.captureId,
            capturedUsdCents: captured.capturedUsdCents,
          });
        } else if (captured.pendingCaptureId) {
          // Not settled yet (eCheck) — remember the capture id so the later
          // PAYMENT.CAPTURE.COMPLETED event can be correlated to this order.
          await prisma.paypalOrder.updateMany({
            where: { id: orderId, captureId: null },
            data: { captureId: captured.pendingCaptureId },
          });
        }
        break;
      }

      case "PAYMENT.CAPTURE.COMPLETED": {
        const captureId = event.resource?.id;

        if (!captureId) {
          console.log(
            `PAYMENT.CAPTURE.COMPLETED without capture id (event ${event.id})`
          );
          break;
        }

        // Correlate to our order: related_ids -> "up" link -> stored capture
        // id (persisted when a pending capture was first seen).
        let orderId =
          event.resource?.supplementary_data?.related_ids?.order_id ??
          idFromUpLink(event.resource, "orders");

        if (!orderId) {
          const byCapture = await prisma.paypalOrder.findFirst({
            where: { captureId },
          });
          orderId = byCapture?.id ?? null;
        }

        if (!orderId) {
          console.log(
            `PayPal capture ${captureId} could not be correlated to an order — ignored (event ${event.id})`
          );
          break;
        }

        const capturedUsdCents = event.resource?.amount?.value
          ? Math.round(parseFloat(event.resource.amount.value) * 100)
          : null;

        const result = await settlePaypalOrder({
          orderId,
          captureId,
          capturedUsdCents,
        });

        // "not_found" is expected for events that aren't credit purchases.
        if (result === "not_found") {
          console.log(`PayPal capture for unknown order ${orderId} — ignored`);
        }
        break;
      }

      case "PAYMENT.CAPTURE.DENIED": {
        const captureId = event.resource?.id;
        if (!captureId) break;

        await denyPaypalOrder(captureId);
        break;
      }

      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED": {
        // The resource is the refund; its "up" link points at the capture.
        const captureId = idFromUpLink(event.resource, "captures");

        if (!captureId) {
          console.log(
            `${event.event_type} without capture up-link (event ${event.id})`
          );
          break;
        }

        const result = await refundPaypalOrder(captureId);

        if (result === "refunded") {
          console.log(`PayPal capture ${captureId} refunded — credits clawed back`);
        }
        break;
      }

      default:
        console.log(`Unhandled PayPal event type: ${event.event_type}`);
    }
  } catch (error) {
    console.error(`Error handling PayPal ${event.event_type}:`, error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

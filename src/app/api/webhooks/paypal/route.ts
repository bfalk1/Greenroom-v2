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
import {
  activatePaypalSubscription,
  grantPaypalSubscriptionCycle,
  syncPaypalSubscription,
} from "@/lib/paypal/subscriptions";

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
    // Subscription events: sale resources carry the subscription id here.
    billing_agreement_id?: string;
    plan_id?: string;
    // Refund resources reference their original sale here (NOT billing_agreement_id).
    sale_id?: string;
  };
}

// A capture's "up" link points at its order; a refund's "up" link points at
// its capture (v2) or sale (v1). Fallback correlation when the direct ids
// aren't on the event.
function idFromUpLink(
  resource: PaypalWebhookEvent["resource"],
  pathSegment: "orders" | "captures" | "sale"
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

      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const subscriptionId = event.resource?.id;
        if (!subscriptionId) break;

        // Sync + grant any already-completed transactions (idempotent —
        // overlaps safely with the return route and SALE events).
        await activatePaypalSubscription(subscriptionId);
        break;
      }

      case "PAYMENT.SALE.COMPLETED": {
        const saleId = event.resource?.id;
        const subscriptionId = event.resource?.billing_agreement_id;

        // Sales without a billing agreement aren't subscription cycles
        // (one-time pack payments arrive as PAYMENT.CAPTURE.*).
        if (!saleId || !subscriptionId) break;

        // Events can arrive out of order — a SALE may beat ACTIVATED, so
        // sync (which upserts the local row) before granting.
        const sub = await prisma.subscription.findUnique({
          where: { paypalSubscriptionId: subscriptionId },
          include: { tier: true },
        });

        if (!sub) {
          const synced = await syncPaypalSubscription(subscriptionId);
          if (!synced) {
            console.log(
              `PayPal sale ${saleId} for unknown subscription ${subscriptionId} — ignored`
            );
            break;
          }
          await grantPaypalSubscriptionCycle({
            saleId,
            eventType: event.event_type,
            userId: synced.userId,
            creditsPerMonth: synced.creditsPerMonth,
            tierDisplayName: synced.tierDisplayName,
          });
          break;
        }

        await grantPaypalSubscriptionCycle({
          saleId,
          eventType: event.event_type,
          userId: sub.userId,
          creditsPerMonth: sub.tier.creditsPerMonth,
          tierDisplayName: sub.tier.displayName,
        });

        // Refresh period dates (renewal moved the window forward).
        await syncPaypalSubscription(subscriptionId);
        break;
      }

      case "BILLING.SUBSCRIPTION.UPDATED": {
        const subscriptionId = event.resource?.id;
        if (!subscriptionId) break;

        // Plan changes take effect on the NEXT billing cycle — PayPal charges
        // nothing at revision approval, so NO credits are granted here; the
        // next PAYMENT.SALE.COMPLETED grants the new tier's full amount.
        // (Granting a top-up on revision would be a free-credit mint:
        // revise+cancel, or downgrade/upgrade cycling, prints credits PayPal
        // never bills for.)
        await syncPaypalSubscription(subscriptionId);
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED": {
        const subscriptionId = event.resource?.id;
        if (!subscriptionId) break;

        // Buyer paid through the period — keep access until currentPeriodEnd;
        // the daily cron flips subscriptionStatus to canceled after that.
        await prisma.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: { cancelAtPeriodEnd: true },
        });
        break;
      }

      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        const subscriptionId = event.resource?.id;
        if (!subscriptionId) break;

        const sub = await prisma.subscription.findUnique({
          where: { paypalSubscriptionId: subscriptionId },
        });
        if (!sub) break;

        // Dunning, not cancellation — cancelAtPeriodEnd stays untouched so
        // the user can still cancel and a successful PayPal retry
        // (SALE.COMPLETED → sync ACTIVE) resumes billing. past_due still
        // passes the paywall; the cron's grace window ends access if the
        // retries never succeed.
        await prisma.user.update({
          where: { id: sub.userId },
          data: { subscriptionStatus: "past_due" },
        });
        break;
      }

      case "PAYMENT.SALE.REFUNDED":
      case "PAYMENT.SALE.REVERSED": {
        // The resource is the REFUND, which carries sale_id (not
        // billing_agreement_id). Correlate to the original grant transaction
        // by referenceId = sale id — that also yields exactly what was
        // granted at the time, even if the tier changed since.
        const refundId = event.resource?.id;
        const saleId =
          event.resource?.sale_id ?? idFromUpLink(event.resource, "sale");

        if (!refundId || !saleId) {
          console.error(
            `${event.event_type} could not be correlated to a sale (event ${event.id}) — credits NOT clawed back, investigate manually`
          );
          break;
        }

        const grant = await prisma.creditTransaction.findFirst({
          where: {
            referenceId: saleId,
            type: "SUBSCRIPTION",
            amount: { gt: 0 },
          },
        });

        if (!grant) {
          console.log(
            `${event.event_type} for sale ${saleId} with no matching grant — ignored`
          );
          break;
        }

        // Claw back the granted cycle, keyed by SALE id: the clawback always
        // debits the full cycle, so a second partial refund (or a chargeback
        // after a partial refund) on the same sale must no-op, not double-
        // debit. Also dedups redeliveries and REFUNDED/REVERSED overlap.
        // Partial refunds claw back the full cycle — refund whole cycles, or
        // adjust manually via admin. Balance may go negative if spent.
        try {
          await prisma.$transaction([
            prisma.paypalWebhookEvent.create({
              data: { id: `refund-sale:${saleId}`, type: event.event_type },
            }),
            prisma.creditBalance.upsert({
              where: { userId: grant.userId },
              update: { balance: { decrement: grant.amount } },
              create: { userId: grant.userId, balance: -grant.amount },
            }),
            prisma.creditTransaction.create({
              data: {
                userId: grant.userId,
                amount: -grant.amount,
                type: "REFUND",
                referenceId: refundId,
                note: `Refunded ${grant.amount} credits (PayPal subscription refund of sale ${saleId})`,
              },
            }),
          ]);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          ) {
            console.log(
              `PayPal refund ${refundId} ignored — sale ${saleId} already clawed back`
            );
            break;
          }
          throw error;
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

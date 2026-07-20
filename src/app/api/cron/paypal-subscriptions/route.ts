import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Verify cron secret to prevent unauthorized access. FAIL CLOSED: an
// unconfigured secret rejects every request (same policy as monthly-payouts).
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured — refusing to run");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

// Daily. Stripe tells us when a canceled subscription actually ends
// (customer.subscription.deleted at period end); PayPal cancels immediately
// and never calls back — so canceled PayPal subscribers keep access until
// currentPeriodEnd via this sweep, then flip to canceled. Also ends access
// for past_due (suspended) PayPal subscribers after a grace window, since
// PayPal fires no further events once a subscription sits suspended.
const PAST_DUE_GRACE_MS = 1000 * 60 * 60 * 24 * 7;

async function runSweep(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const expired = await prisma.subscription.findMany({
      where: {
        provider: "paypal",
        OR: [
          {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: { lt: now },
            user: { subscriptionStatus: { not: "canceled" } },
          },
          {
            currentPeriodEnd: { lt: new Date(now.getTime() - PAST_DUE_GRACE_MS) },
            user: { subscriptionStatus: "past_due" },
          },
        ],
      },
      select: { userId: true, paypalSubscriptionId: true },
    });

    for (const sub of expired) {
      await prisma.user.update({
        where: { id: sub.userId },
        data: { subscriptionStatus: "canceled" },
      });
      console.log(
        `PayPal subscription ${sub.paypalSubscriptionId} reached period end — user ${sub.userId} set to canceled`
      );
    }

    // Age-bound the checkout_attributions rows (fbp/fbc cookies, IP, user
    // agent captured at PayPal checkout for the Meta CAPI Purchase). Consumed
    // or abandoned, a row is useless once the activation window is long past —
    // 60 days comfortably covers the 30-day referral/activation window plus
    // webhook redelivery lag. Best-effort: retention hygiene must never fail
    // the expiry sweep above.
    const purgedAttributions = await prisma.checkoutAttribution
      .deleteMany({
        where: {
          createdAt: { lt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
        },
      })
      .then((r) => r.count)
      .catch((error) => {
        console.error("checkout_attributions sweep failed:", error);
        return 0;
      });

    return NextResponse.json({
      ok: true,
      expired: expired.length,
      purgedAttributions,
    });
  } catch (error) {
    console.error("PayPal subscription expiry cron failed:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

// Vercel cron invokes with GET (Authorization: Bearer CRON_SECRET);
// POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return runSweep(request);
}

export async function POST(request: NextRequest) {
  return runSweep(request);
}

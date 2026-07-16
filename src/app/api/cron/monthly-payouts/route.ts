import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calculateCreatorEarningsCents,
  getCreatorCreditsSpent,
  getCreatorReferralCashCents,
  getPayoutFeeConfig,
  nextPayoutInvoiceNumber,
} from "@/lib/payouts";
import {
  computeUnpaidCents,
  computeProcessingFeeCents,
  MIN_PAYOUT_CENTS,
} from "@/lib/payoutMath";
import { sendPayoutSummaryToAdmin } from "@/lib/email";

// This iterates every active creator; give it room beyond the default limit.
export const maxDuration = 300;

// Verify cron secret to prevent unauthorized access. FAIL CLOSED: an unconfigured
// secret rejects every request (no dev bypass — set CRON_SECRET locally to run it).
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured — refusing to run payouts");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

// POST /api/cron/monthly-payouts
//
// Runs on the 1st of each month. For every creator with an unpaid balance over
// the minimum, it creates a PENDING CreatorPayout row — a queue for the admin.
// It NEVER moves money: the only place a Stripe transfer is created is the admin
// approval path (PATCH /api/admin/payouts). This keeps a human checkpoint on
// every real disbursement.
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    processed: 0,
    payoutsQueued: 0,
    totalQueuedCents: 0,
    skippedBelowThreshold: 0,
    skippedExisting: 0,
    errors: [] as string[],
  };

  try {
    // Period label = the previous full calendar month. The row's AMOUNT is the
    // all-time unpaid balance (catch-up model); the period is just when it was
    // generated and the key for the per-period uniqueness guard.
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd.setMilliseconds(-1); // last moment of previous month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

    console.log(
      `Queuing payouts for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`
    );

    const creators = await prisma.user.findMany({
      where: { role: "CREATOR", isActive: true },
      select: { id: true, email: true },
    });

    console.log(`Found ${creators.length} active creators`);

    // Processing fee config is platform-wide; fetch once for the whole run.
    const feeConfig = await getPayoutFeeConfig();

    for (const creator of creators) {
      results.processed++;

      try {
        // Don't queue a second payout for the same generation period.
        const existingPayout = await prisma.creatorPayout.findFirst({
          where: { creatorId: creator.id, periodStart, periodEnd },
          select: { id: true },
        });
        if (existingPayout) {
          results.skippedExisting++;
          continue;
        }

        // All-time earnings (samples + presets) minus everything already
        // accounted for — PAID *and* in-flight PENDING. Subtracting PENDING is
        // essential under the approval gate: pending rows sit unapproved, so
        // counting only PAID would re-queue them and double-pay on approval.
        const accounted = await prisma.creatorPayout.findMany({
          where: { creatorId: creator.id, status: { in: ["PAID", "PENDING"] } },
          select: {
            amountUsdCents: true,
            totalCreditsSpent: true,
            referralBonusCents: true,
          },
        });
        const accountedCents = accounted.reduce((s, p) => s + p.amountUsdCents, 0);
        const accountedCredits = accounted.reduce((s, p) => s + p.totalCreditsSpent, 0);
        const accountedReferralCents = accounted.reduce(
          (s, p) => s + p.referralBonusCents,
          0
        );

        const totalCredits = await getCreatorCreditsSpent(creator.id);
        const catalogEarningsCents = await calculateCreatorEarningsCents(
          creator.id,
          totalCredits
        );
        // Total earnings = catalog sales + referral cash rewards.
        const referralCashCents = await getCreatorReferralCashCents(creator.id);
        const totalEarningsCents = catalogEarningsCents + referralCashCents;

        const unpaidCents = computeUnpaidCents(totalEarningsCents, accountedCents);
        const unpaidCredits = Math.max(0, totalCredits - accountedCredits);
        // Referral portion of this payout, for invoice itemization. Clamped to
        // the row amount so the split can never exceed the gross.
        const unpaidReferralCents = Math.min(
          unpaidCents,
          computeUnpaidCents(referralCashCents, accountedReferralCents)
        );

        if (unpaidCents < MIN_PAYOUT_CENTS) {
          results.skippedBelowThreshold++;
          continue;
        }

        // Amount and credits are stored on the SAME (all-time-unpaid) basis so
        // the row is internally consistent for reconciliation/invoices.
        await prisma.creatorPayout.create({
          data: {
            creatorId: creator.id,
            periodStart,
            periodEnd,
            totalCreditsSpent: unpaidCredits,
            amountUsdCents: unpaidCents,
            referralBonusCents: unpaidReferralCents,
            processingFeeCents: computeProcessingFeeCents(
              unpaidCents,
              feeConfig.feeBps,
              feeConfig.feeFixedCents
            ),
            invoiceNumber: await nextPayoutInvoiceNumber(),
            status: "PENDING",
          },
        });

        results.payoutsQueued++;
        results.totalQueuedCents += unpaidCents;
        console.log(
          `Queued payout for ${creator.email}: $${(unpaidCents / 100).toFixed(2)}`
        );
      } catch (creatorError) {
        // The @@unique([creatorId, periodStart, periodEnd]) backstop can catch a
        // concurrent run; treat that as already-queued, not an error.
        if (
          creatorError &&
          typeof creatorError === "object" &&
          "code" in creatorError &&
          (creatorError as { code?: string }).code === "P2002"
        ) {
          results.skippedExisting++;
          continue;
        }
        const errorMsg =
          creatorError instanceof Error ? creatorError.message : "Unknown error";
        results.errors.push(`${creator.email}: ${errorMsg}`);
        console.error(`Error processing ${creator.email}:`, creatorError);
      }
    }

    console.log("Monthly payout queueing complete:", results);

    // Summary to admin (so a partial/zero run is observable). Best-effort.
    try {
      await sendPayoutSummaryToAdmin({
        processed: results.processed,
        payoutsQueued: results.payoutsQueued,
        totalAmountUsd: results.totalQueuedCents / 100,
        skippedBelowThreshold: results.skippedBelowThreshold,
        errors: results.errors,
      });
    } catch (emailError) {
      console.error("Failed to send admin summary email:", emailError);
    }

    return NextResponse.json({
      success: true,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      results: {
        ...results,
        totalQueuedUsd: results.totalQueuedCents / 100,
      },
    });
  } catch (error) {
    console.error("Monthly payout cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        results,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for checking status/testing
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pendingPayouts = await prisma.creatorPayout.findMany({
    where: { status: "PENDING" },
    include: {
      creator: {
        select: { email: true, artistName: true },
      },
    },
  });

  const lastPayout = await prisma.creatorPayout.findFirst({
    where: { status: "PAID" },
    orderBy: { paidAt: "desc" },
  });

  return NextResponse.json({
    minPayoutThreshold: MIN_PAYOUT_CENTS / 100,
    pendingPayouts: pendingPayouts.length,
    lastApprovedPayout: lastPayout?.paidAt?.toISOString() || null,
    pending: pendingPayouts.map((p) => ({
      id: p.id,
      creator: p.creator.artistName || p.creator.email,
      amount: p.amountUsdCents / 100,
      period: `${p.periodStart.toISOString().split("T")[0]} to ${p.periodEnd.toISOString().split("T")[0]}`,
    })),
  });
}

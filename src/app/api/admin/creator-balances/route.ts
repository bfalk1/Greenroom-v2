import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  calculateCreatorEarningsCents,
  getCreatorCreditsSpent,
  getCreatorReferralCashCents,
  getCreatorAdjustmentCents,
} from "@/lib/payouts";
import { computeUnpaidCents, MIN_PAYOUT_CENTS } from "@/lib/payoutMath";

// This can iterate every active creator; give it room beyond the default.
export const maxDuration = 120;

// GET /api/admin/creator-balances
//
// What each creator is currently OWED, right now — computed through the exact
// same helpers as the monthly payout cron (catalog + referral + adjustments −
// already-accounted payouts), so the numbers here match what will actually be
// queued and paid. Unlike /api/admin/payouts (which only lists CreatorPayout
// rows that already exist), this surfaces balances that have not been requested
// or queued yet — e.g. flat bonuses granted before the 1st-of-month cron runs.
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const creators = await prisma.user.findMany({
      where: { role: "CREATOR", isActive: true },
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        fullName: true,
      },
    });

    const computeOne = async (c: (typeof creators)[number]) => {
      const totalCredits = await getCreatorCreditsSpent(c.id);
      const catalogCents = await calculateCreatorEarningsCents(
        c.id,
        totalCredits
      );
      const referralCents = await getCreatorReferralCashCents(c.id);
      const adjustmentCents = await getCreatorAdjustmentCents(c.id);
      const totalEarningsCents =
        catalogCents + referralCents + adjustmentCents;

      // Accounted = everything already PAID or PENDING (a pending row is money
      // already committed, so it must be subtracted or we'd double-count it).
      const accounted = await prisma.creatorPayout.aggregate({
        where: { creatorId: c.id, status: { in: ["PAID", "PENDING"] } },
        _sum: { amountUsdCents: true },
      });
      const owedCents = computeUnpaidCents(
        totalEarningsCents,
        accounted._sum.amountUsdCents ?? 0
      );

      return {
        creatorId: c.id,
        name: c.artistName || c.fullName || c.username || c.email,
        email: c.email,
        username: c.username,
        owedUsd: owedCents / 100,
        catalogUsd: catalogCents / 100,
        referralUsd: referralCents / 100,
        adjustmentUsd: adjustmentCents / 100,
        // Below the minimum, the cron won't queue it yet — surface that so the
        // admin knows why an owed creator isn't in the request list.
        meetsMinimum: owedCents >= MIN_PAYOUT_CENTS,
        owedCents,
      };
    };

    // Bounded concurrency: each creator is ~8 queries, so fan out in small
    // batches rather than firing hundreds of queries at the pooler at once.
    const BATCH = 8;
    const rows: Awaited<ReturnType<typeof computeOne>>[] = [];
    for (let i = 0; i < creators.length; i += BATCH) {
      const batch = creators.slice(i, i + BATCH);
      rows.push(...(await Promise.all(batch.map(computeOne))));
    }

    // Only creators actually owed money, most-owed first.
    const owed = rows
      .filter((r) => r.owedCents > 0)
      .sort((a, b) => b.owedCents - a.owedCents);

    const totalOwedCents = owed.reduce((s, r) => s + r.owedCents, 0);
    const readyCents = owed
      .filter((r) => r.meetsMinimum)
      .reduce((s, r) => s + r.owedCents, 0);

    return NextResponse.json({
      creators: owed.map(({ owedCents: _o, ...rest }) => rest),
      totalOwed: totalOwedCents / 100,
      readyToPay: readyCents / 100,
      minPayout: MIN_PAYOUT_CENTS / 100,
      count: owed.length,
    });
  } catch (error) {
    console.error("GET /api/admin/creator-balances error:", error);
    return NextResponse.json(
      { error: "Failed to compute creator balances" },
      { status: 500 }
    );
  }
}

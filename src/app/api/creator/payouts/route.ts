import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
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
  computeNetPayoutCents,
  MIN_PAYOUT_CENTS,
} from "@/lib/payoutMath";

// GET /api/creator/payouts — fetch payout history for the authenticated creator
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

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    const payouts = await prisma.creatorPayout.findMany({
      where: { creatorId: authUser.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        totalCreditsSpent: p.totalCreditsSpent,
        amountUsd: p.amountUsdCents / 100,
        processingFeeUsd: p.processingFeeCents / 100,
        netAmountUsd:
          computeNetPayoutCents(p.amountUsdCents, p.processingFeeCents) / 100,
        invoiceNumber: p.invoiceNumber,
        status: p.status,
        paidAt: p.paidAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/creator/payouts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payouts" },
      { status: 500 }
    );
  }
}

// POST /api/creator/payouts — request a new payout
export async function POST(_request: NextRequest) {
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
      select: { role: true, createdAt: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // Check for existing pending payout
    const existingPending = await prisma.creatorPayout.findFirst({
      where: { creatorId: authUser.id, status: "PENDING" },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: "You already have a pending payout request" },
        { status: 400 }
      );
    }

    // Total credits earned across the creator's WHOLE catalog (samples AND
    // presets) — counting only samples previously left preset sales unpaid.
    const totalCreditsEarned = await getCreatorCreditsSpent(authUser.id);

    // Calculate earnings using creator's effective payout rate
    const catalogEarningsCents = await calculateCreatorEarningsCents(
      authUser.id,
      totalCreditsEarned
    );
    // Total earnings = catalog sales + referral cash rewards.
    const referralCashCents = await getCreatorReferralCashCents(authUser.id);
    const totalEarningsCents = catalogEarningsCents + referralCashCents;

    // Get total already paid out or pending
    const payoutAgg = await prisma.creatorPayout.aggregate({
      where: {
        creatorId: authUser.id,
        status: { in: ["PAID", "PENDING"] },
      },
      _sum: { amountUsdCents: true, referralBonusCents: true },
    });

    const alreadyAccountedCents = payoutAgg._sum.amountUsdCents || 0;
    const unpaidCents = computeUnpaidCents(totalEarningsCents, alreadyAccountedCents);
    // Referral portion of this payout, for invoice itemization. Clamped to the
    // row amount so the split can never exceed the gross.
    const unpaidReferralCents = Math.min(
      unpaidCents,
      computeUnpaidCents(
        referralCashCents,
        payoutAgg._sum.referralBonusCents || 0
      )
    );

    if (unpaidCents < MIN_PAYOUT_CENTS) {
      return NextResponse.json(
        {
          error: `You need at least $${(MIN_PAYOUT_CENTS / 100).toFixed(2)} in unpaid earnings to request a payout.`,
        },
        { status: 400 }
      );
    }

    // Calculate credits for this payout period
    const alreadyAccountedCredits = await prisma.creatorPayout.aggregate({
      where: {
        creatorId: authUser.id,
        status: { in: ["PAID", "PENDING"] },
      },
      _sum: { totalCreditsSpent: true },
    });

    const unpaidCredits = Math.max(
      0,
      totalCreditsEarned - (alreadyAccountedCredits._sum.totalCreditsSpent || 0)
    );

    // Determine period start: day after last payout end, or account creation date
    const lastPayout = await prisma.creatorPayout.findFirst({
      where: { creatorId: authUser.id },
      orderBy: { periodEnd: "desc" },
    });

    let periodStart: Date;
    if (lastPayout) {
      periodStart = new Date(lastPayout.periodEnd);
      periodStart.setDate(periodStart.getDate() + 1);
    } else {
      periodStart = new Date(dbUser.createdAt);
    }

    const periodEnd = new Date();

    // Processing fee (covered by the creator) locked in at request time, and
    // an invoice number so the request immediately has a referenceable invoice.
    const feeConfig = await getPayoutFeeConfig();
    const processingFeeCents = computeProcessingFeeCents(
      unpaidCents,
      feeConfig.feeBps,
      feeConfig.feeFixedCents
    );
    const invoiceNumber = await nextPayoutInvoiceNumber();

    // Create the payout record
    const payout = await prisma.creatorPayout.create({
      data: {
        creatorId: authUser.id,
        periodStart,
        periodEnd,
        totalCreditsSpent: unpaidCredits,
        amountUsdCents: unpaidCents,
        referralBonusCents: unpaidReferralCents,
        processingFeeCents,
        invoiceNumber,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      payout: {
        id: payout.id,
        periodStart: payout.periodStart.toISOString(),
        periodEnd: payout.periodEnd.toISOString(),
        totalCreditsSpent: payout.totalCreditsSpent,
        amountUsd: payout.amountUsdCents / 100,
        processingFeeUsd: payout.processingFeeCents / 100,
        netAmountUsd:
          computeNetPayoutCents(payout.amountUsdCents, payout.processingFeeCents) /
          100,
        invoiceNumber: payout.invoiceNumber,
        status: payout.status,
        paidAt: null,
        createdAt: payout.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("POST /api/creator/payouts error:", error);
    return NextResponse.json(
      { error: "Failed to create payout request" },
      { status: 500 }
    );
  }
}

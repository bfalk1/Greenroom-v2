import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  calculateCreatorEarningsCents,
  getCreatorEarningsInfo,
  getCreatorCreditsSpent,
  getCreatorReferralCashCents,
  getPayoutFeeConfig,
} from "@/lib/payouts";
import { computeNetPayoutCents } from "@/lib/payoutMath";

// GET /api/creator/earnings — fetch earnings data for the authenticated creator
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

    // Get all samples by this creator
    const creatorSamples = await prisma.sample.findMany({
      where: { creatorId: authUser.id },
      select: { id: true, name: true, creditPrice: true },
    });

    const sampleIds = creatorSamples.map((s) => s.id);
    const sampleMap = Object.fromEntries(
      creatorSamples.map((s) => [s.id, s])
    );

    // Get all purchases of this creator's samples
    const purchases = await prisma.purchase.findMany({
      where: { sampleId: { in: sampleIds } },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { username: true, email: true },
        },
        _count: {
          select: { downloads: true },
        },
      },
    });

    // Calculate this month's earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    // Credits earned this month across the WHOLE catalog (samples + presets),
    // so the figure matches what the creator is actually paid.
    const thisMonthCredits = await getCreatorCreditsSpent(authUser.id, {
      gte: startOfMonth,
    });

    // Get total downloads across all creator's samples
    const totalDownloads = await prisma.download.count({
      where: { sampleId: { in: sampleIds } },
    });

    // Get payout info
    const payouts = await prisma.creatorPayout.findMany({
      where: { creatorId: authUser.id },
      orderBy: { createdAt: "desc" },
    });

    const totalPaidOutCents = payouts
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amountUsdCents, 0);

    const pendingPayoutCents = payouts
      .filter((p) => p.status === "PENDING")
      .reduce((sum, p) => sum + p.amountUsdCents, 0);

    // Total credits earned across the WHOLE catalog (samples + presets).
    const totalCreditsEarned = await getCreatorCreditsSpent(authUser.id);

    // Calculate earnings using creator's effective payout rate. Total
    // earnings = catalog sales + referral cash rewards (same basis as the
    // payout routes, so the displayed balance matches what gets paid).
    const catalogEarningsCents = await calculateCreatorEarningsCents(
      authUser.id,
      totalCreditsEarned
    );
    const referralCashCents = await getCreatorReferralCashCents(authUser.id);
    const totalEarningsCents = catalogEarningsCents + referralCashCents;

    // Calculate this month's earnings in cents (range-scoped for both parts)
    const thisMonthCatalogCents = await calculateCreatorEarningsCents(
      authUser.id,
      thisMonthCredits
    );
    const thisMonthReferralCents = await getCreatorReferralCashCents(
      authUser.id,
      { gte: startOfMonth }
    );
    const thisMonthEarningsCents = thisMonthCatalogCents + thisMonthReferralCents;

    // Get payout rate + processing fee info for display
    const [earningsInfo, feeConfig] = await Promise.all([
      getCreatorEarningsInfo(authUser.id),
      getPayoutFeeConfig(),
    ]);

    const mappedPurchases = purchases.map((p) => ({
      id: p.id,
      sampleId: p.sampleId,
      sampleName: (p.sampleId ? sampleMap[p.sampleId]?.name : null) || "Unknown",
      buyerUsername: p.user.username || p.user.email,
      creditsSpent: p.creditsSpent,
      downloadCount: p._count.downloads,
      createdAt: p.createdAt.toISOString(),
    }));

    return NextResponse.json({
      stats: {
        totalEarnings: totalEarningsCents / 100,
        totalPurchases: purchases.length,
        totalDownloads,
        totalPaidOut: totalPaidOutCents / 100,
        pendingPayout: pendingPayoutCents / 100,
        unpaidEarnings: (totalEarningsCents - totalPaidOutCents) / 100,
        thisMonthEarnings: thisMonthEarningsCents / 100,
        referralEarnings: referralCashCents / 100,
      },
      payoutInfo: {
        centsPerCredit: earningsInfo.centsPerCredit,
        perCreditDisplay: earningsInfo.perCreditDisplay,
        isCustomRate: earningsInfo.isCustomRate,
        // Processing fee (covered by the creator, deducted from each payout)
        payoutFeeBps: feeConfig.feeBps,
        payoutFeeFixedCents: feeConfig.feeFixedCents,
      },
      purchases: mappedPurchases,
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
      })),
    });
  } catch (error) {
    console.error("GET /api/creator/earnings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}

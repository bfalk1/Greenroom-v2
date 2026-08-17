import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  calculateCreatorEarningsCents,
  getCreatorEarningsInfo,
  getCreatorCreditsSpent,
  getCreatorReferralCashCents,
  getCreatorAdjustmentCents,
  getPayoutFeeConfig,
} from "@/lib/payouts";
import { computeNetPayoutCents, computePayoutCents } from "@/lib/payoutMath";

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
      select: { role: true, paypalEmail: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // The creator's whole catalog — samples AND presets. Both earn credits, so
    // both belong in the per-item performance table (and in the totals above it).
    const [creatorSamples, creatorPresets] = await Promise.all([
      prisma.sample.findMany({
        where: { creatorId: authUser.id },
        select: {
          id: true,
          name: true,
          creditPrice: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.preset.findMany({
        where: { creatorId: authUser.id },
        select: {
          id: true,
          name: true,
          creditPrice: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const sampleIds = creatorSamples.map((s) => s.id);
    const presetIds = creatorPresets.map((p) => p.id);

    // Per-item aggregates. Grouped in SQL rather than pulling every purchase row
    // — a creator with thousands of sales shouldn't stream them all into memory.
    const [
      samplePurchaseGroups,
      presetPurchaseGroups,
      sampleDownloadGroups,
      presetDownloadGroups,
    ] = await Promise.all([
      sampleIds.length
        ? prisma.purchase.groupBy({
            by: ["sampleId"],
            where: { sampleId: { in: sampleIds } },
            _count: { _all: true },
            _sum: { creditsSpent: true },
          })
        : [],
      presetIds.length
        ? prisma.purchase.groupBy({
            by: ["presetId"],
            where: { presetId: { in: presetIds } },
            _count: { _all: true },
            _sum: { creditsSpent: true },
          })
        : [],
      sampleIds.length
        ? prisma.download.groupBy({
            by: ["sampleId"],
            where: { sampleId: { in: sampleIds } },
            _count: { _all: true },
          })
        : [],
      presetIds.length
        ? prisma.download.groupBy({
            by: ["presetId"],
            where: { presetId: { in: presetIds } },
            _count: { _all: true },
          })
        : [],
    ]);

    type ItemSales = { purchases: number; credits: number };
    const salesById = new Map<string, ItemSales>();
    for (const g of samplePurchaseGroups) {
      if (!g.sampleId) continue;
      salesById.set(g.sampleId, {
        purchases: g._count._all,
        credits: g._sum.creditsSpent ?? 0,
      });
    }
    for (const g of presetPurchaseGroups) {
      if (!g.presetId) continue;
      salesById.set(g.presetId, {
        purchases: g._count._all,
        credits: g._sum.creditsSpent ?? 0,
      });
    }

    const downloadsById = new Map<string, number>();
    for (const g of sampleDownloadGroups) {
      if (g.sampleId) downloadsById.set(g.sampleId, g._count._all);
    }
    for (const g of presetDownloadGroups) {
      if (g.presetId) downloadsById.set(g.presetId, g._count._all);
    }

    // Calculate this month's earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    // Credits earned this month across the WHOLE catalog (samples + presets),
    // so the figure matches what the creator is actually paid.
    const thisMonthCredits = await getCreatorCreditsSpent(authUser.id, {
      gte: startOfMonth,
    });

    // Catalog-wide totals, derived from the same per-item aggregates the table
    // below is built from — so the stat cards always reconcile with the rows.
    let totalPurchases = 0;
    for (const s of salesById.values()) totalPurchases += s.purchases;
    let totalDownloads = 0;
    for (const d of downloadsById.values()) totalDownloads += d;

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
    // Flat non-sales grants (e.g. on-time upload bonus) — third earnings
    // component, on the same basis as catalog + referral above.
    const adjustmentCents = await getCreatorAdjustmentCents(authUser.id);
    const totalEarningsCents =
      catalogEarningsCents + referralCashCents + adjustmentCents;

    // Calculate this month's earnings in cents (range-scoped for all parts)
    const thisMonthCatalogCents = await calculateCreatorEarningsCents(
      authUser.id,
      thisMonthCredits
    );
    const thisMonthReferralCents = await getCreatorReferralCashCents(
      authUser.id,
      { gte: startOfMonth }
    );
    const thisMonthAdjustmentCents = await getCreatorAdjustmentCents(
      authUser.id,
      { gte: startOfMonth }
    );
    const thisMonthEarningsCents =
      thisMonthCatalogCents + thisMonthReferralCents + thisMonthAdjustmentCents;

    // Get payout rate + processing fee info for display
    const [earningsInfo, feeConfig] = await Promise.all([
      getCreatorEarningsInfo(authUser.id),
      getPayoutFeeConfig(),
    ]);

    // Per-item performance: every sample and preset the creator owns, with what
    // it sold, how often it was downloaded and what it actually paid them.
    // Earnings use the same credits × rate math as the payout engine, so the
    // column sums to the balance on this page.
    const buildRow = (
      item: {
        id: string;
        name: string;
        creditPrice: number;
        status: string;
        createdAt: Date;
      },
      type: "SAMPLE" | "PRESET"
    ) => {
      const sales = salesById.get(item.id);
      const credits = sales?.credits ?? 0;
      return {
        id: item.id,
        type,
        name: item.name,
        creditPrice: item.creditPrice,
        status: item.status,
        purchases: sales?.purchases ?? 0,
        credits,
        downloads: downloadsById.get(item.id) ?? 0,
        earningsUsd:
          computePayoutCents(credits, earningsInfo.centsPerCredit) / 100,
        createdAt: item.createdAt.toISOString(),
      };
    };

    // Best sellers first; ties broken by earnings, then downloads, then newest —
    // so a creator's top earners are always the first thing they read.
    const catalog = [
      ...creatorSamples.map((s) => buildRow(s, "SAMPLE")),
      ...creatorPresets.map((p) => buildRow(p, "PRESET")),
    ].sort(
      (a, b) =>
        b.purchases - a.purchases ||
        b.earningsUsd - a.earningsUsd ||
        b.downloads - a.downloads ||
        b.createdAt.localeCompare(a.createdAt)
    );

    return NextResponse.json({
      stats: {
        totalEarnings: totalEarningsCents / 100,
        totalPurchases,
        totalDownloads,
        totalPaidOut: totalPaidOutCents / 100,
        pendingPayout: pendingPayoutCents / 100,
        unpaidEarnings: (totalEarningsCents - totalPaidOutCents) / 100,
        thisMonthEarnings: thisMonthEarningsCents / 100,
        referralEarnings: referralCashCents / 100,
        adjustmentEarnings: adjustmentCents / 100,
      },
      payoutInfo: {
        centsPerCredit: earningsInfo.centsPerCredit,
        perCreditDisplay: earningsInfo.perCreditDisplay,
        isCustomRate: earningsInfo.isCustomRate,
        // Processing fee (covered by the creator, deducted from each payout)
        payoutFeeBps: feeConfig.feeBps,
        payoutFeeFixedCents: feeConfig.feeFixedCents,
        // Destination for the money. Null until the creator sets it, which every
        // payout path requires — the page surfaces it as a blocking prompt.
        paypalEmail: dbUser.paypalEmail,
      },
      catalog,
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

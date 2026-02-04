import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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

    // Calculate total credits earned
    const totalCreditsEarned = purchases.reduce(
      (sum, p) => sum + p.creditsSpent,
      0
    );

    // $0.03 per credit earned by creator
    const totalEarningsCents = totalCreditsEarned * 3;

    const mappedPurchases = purchases.map((p) => ({
      id: p.id,
      sampleId: p.sampleId,
      sampleName: sampleMap[p.sampleId]?.name || "Unknown",
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
      },
      purchases: mappedPurchases,
      payouts: payouts.map((p) => ({
        id: p.id,
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        totalCreditsSpent: p.totalCreditsSpent,
        amountUsd: p.amountUsdCents / 100,
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

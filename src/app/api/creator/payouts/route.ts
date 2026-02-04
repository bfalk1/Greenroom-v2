import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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
      select: { role: true, createdAt: true, stripeConnectId: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // Require Stripe Connect before requesting payout
    if (!dbUser.stripeConnectId) {
      return NextResponse.json(
        { error: "Please connect your Stripe account before requesting a payout." },
        { status: 400 }
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

    // Get all samples by this creator
    const creatorSamples = await prisma.sample.findMany({
      where: { creatorId: authUser.id },
      select: { id: true },
    });

    const sampleIds = creatorSamples.map((s) => s.id);

    // Calculate total credits earned from purchases
    const purchaseAgg = await prisma.purchase.aggregate({
      where: { sampleId: { in: sampleIds } },
      _sum: { creditsSpent: true },
    });

    const totalCreditsEarned = purchaseAgg._sum.creditsSpent || 0;
    const totalEarningsCents = totalCreditsEarned * 3; // $0.03 per credit

    // Get total already paid out or pending
    const payoutAgg = await prisma.creatorPayout.aggregate({
      where: {
        creatorId: authUser.id,
        status: { in: ["PAID", "PENDING"] },
      },
      _sum: { amountUsdCents: true },
    });

    const alreadyAccountedCents = payoutAgg._sum.amountUsdCents || 0;
    const unpaidCents = totalEarningsCents - alreadyAccountedCents;

    // Minimum $0.01 to request (lowered for testing — TODO: raise to $5.00 / 500 cents for production)
    if (unpaidCents < 1) {
      return NextResponse.json(
        {
          error: `No unpaid earnings to withdraw.`,
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

    const unpaidCredits =
      totalCreditsEarned - (alreadyAccountedCredits._sum.totalCreditsSpent || 0);

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

    // Create the payout record
    const payout = await prisma.creatorPayout.create({
      data: {
        creatorId: authUser.id,
        periodStart,
        periodEnd,
        totalCreditsSpent: unpaidCredits,
        amountUsdCents: unpaidCents,
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

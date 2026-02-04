import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/payouts — list all payout requests, filterable by status
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (
      statusFilter &&
      ["PENDING", "PAID", "FAILED"].includes(statusFilter)
    ) {
      where.status = statusFilter;
    }

    const payouts = await prisma.creatorPayout.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            artistName: true,
          },
        },
      },
    });

    return NextResponse.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        creatorId: p.creatorId,
        creator: {
          id: p.creator.id,
          email: p.creator.email,
          username: p.creator.username,
          name:
            p.creator.artistName ||
            p.creator.fullName ||
            p.creator.username ||
            p.creator.email,
        },
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
    console.error("GET /api/admin/payouts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payouts" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/payouts — approve or reject a payout request
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { payoutId, action } = body as {
      payoutId: string;
      action: "approve" | "reject";
      note?: string;
    };

    if (!payoutId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request. Provide payoutId and action (approve/reject)." },
        { status: 400 }
      );
    }

    const payout = await prisma.creatorPayout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      return NextResponse.json(
        { error: "Payout not found" },
        { status: 404 }
      );
    }

    if (payout.status !== "PENDING") {
      return NextResponse.json(
        { error: `Payout is already ${payout.status}` },
        { status: 400 }
      );
    }

    const updated = await prisma.creatorPayout.update({
      where: { id: payoutId },
      data: {
        status: action === "approve" ? "PAID" : "FAILED",
        paidAt: action === "approve" ? new Date() : null,
      },
    });

    return NextResponse.json({
      payout: {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/payouts error:", error);
    return NextResponse.json(
      { error: "Failed to update payout" },
      { status: 500 }
    );
  }
}

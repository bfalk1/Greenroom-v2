import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

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
            stripeConnectId: true,
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
          stripeConnected: !!p.creator.stripeConnectId,
        },
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        totalCreditsSpent: p.totalCreditsSpent,
        amountUsd: p.amountUsdCents / 100,
        status: p.status,
        stripeTransferId: p.stripeTransferId,
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
        {
          error:
            "Invalid request. Provide payoutId and action (approve/reject).",
        },
        { status: 400 }
      );
    }

    const payout = await prisma.creatorPayout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          select: { stripeConnectId: true, email: true },
        },
      },
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

    // Rejection — no Stripe interaction needed
    if (action === "reject") {
      const updated = await prisma.creatorPayout.update({
        where: { id: payoutId },
        data: { status: "FAILED" },
      });

      return NextResponse.json({
        payout: {
          id: updated.id,
          status: updated.status,
          paidAt: null,
          stripeTransferId: null,
        },
      });
    }

    // Approval — send money via Stripe Transfer
    if (!payout.creator.stripeConnectId) {
      return NextResponse.json(
        {
          error: `Creator (${payout.creator.email}) has not connected Stripe. They must complete Stripe Connect onboarding first.`,
        },
        { status: 400 }
      );
    }

    // Verify the connected account can receive transfers
    const account = await stripe.accounts.retrieve(
      payout.creator.stripeConnectId
    );

    if (!account.charges_enabled) {
      return NextResponse.json(
        {
          error: `Creator's Stripe account is not fully set up (charges not enabled). Ask them to complete onboarding.`,
        },
        { status: 400 }
      );
    }

    // Create the Stripe Transfer
    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: payout.amountUsdCents,
        currency: "usd",
        destination: payout.creator.stripeConnectId,
        description: `Greenroom creator payout: ${payout.periodStart.toISOString().split("T")[0]} to ${payout.periodEnd.toISOString().split("T")[0]}`,
        metadata: {
          payoutId: payout.id,
          creatorId: payout.creatorId,
        },
      });
    } catch (stripeError) {
      console.error("Stripe Transfer failed:", stripeError);

      // Mark payout as FAILED
      await prisma.creatorPayout.update({
        where: { id: payoutId },
        data: { status: "FAILED" },
      });

      const message =
        stripeError instanceof Error
          ? stripeError.message
          : "Unknown Stripe error";

      return NextResponse.json(
        { error: `Stripe transfer failed: ${message}` },
        { status: 500 }
      );
    }

    // Mark payout as PAID with transfer ID
    const updated = await prisma.creatorPayout.update({
      where: { id: payoutId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripeTransferId: transfer.id,
      },
    });

    return NextResponse.json({
      payout: {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() || null,
        stripeTransferId: updated.stripeTransferId,
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

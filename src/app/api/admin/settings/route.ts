import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
  DEFAULT_PAYOUT_FEE_BPS,
  DEFAULT_PAYOUT_FEE_FIXED_CENTS,
} from "@/lib/payoutMath";

// GET /api/admin/settings — Get platform settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get or create default settings
    let settings = await prisma.platformSetting.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.platformSetting.create({
        data: {
          id: "default",
          creatorPayoutRate: DEFAULT_PAYOUT_CENTS_PER_CREDIT,
          creditValueCents: 10,
          moderatorIds: [],
        },
      });
    }

    // Get moderator details
    const [moderators, customRateCreators] = await Promise.all([
      settings.moderatorIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: settings.moderatorIds } },
            select: {
              id: true,
              email: true,
              username: true,
              artistName: true,
              avatarUrl: true,
              role: true,
            },
          })
        : Promise.resolve([]),
      // Creators whose payout rate overrides the platform default
      prisma.user.findMany({
        where: { customPayoutRate: { not: null } },
        select: {
          id: true,
          email: true,
          username: true,
          artistName: true,
          customPayoutRate: true,
        },
        orderBy: { email: "asc" },
      }),
    ]);

    return NextResponse.json({
      settings: {
        creatorPayoutRate: settings.creatorPayoutRate,
        creditValueCents: settings.creditValueCents,
        payoutFeeBps: settings.payoutFeeBps,
        payoutFeeFixedCents: settings.payoutFeeFixedCents,
        moderatorIds: settings.moderatorIds,
      },
      moderators,
      customRateCreators,
    });
  } catch (error) {
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/settings — Update platform settings
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { creatorPayoutRate, creditValueCents, payoutFeeBps, payoutFeeFixedCents } =
      body;

    const updateData: {
      creatorPayoutRate?: number;
      creditValueCents?: number;
      payoutFeeBps?: number;
      payoutFeeFixedCents?: number;
      updatedBy: string;
    } = {
      updatedBy: authUser.id,
    };

    if (creatorPayoutRate !== undefined) {
      if (creatorPayoutRate < 0 || creatorPayoutRate > 50) {
        return NextResponse.json(
          { error: "Payout rate must be between 0 and 50 cents per credit" },
          { status: 400 }
        );
      }
      updateData.creatorPayoutRate = creatorPayoutRate;
    }

    if (creditValueCents !== undefined) {
      if (creditValueCents < 1) {
        return NextResponse.json(
          { error: "Credit value must be at least 1 cent" },
          { status: 400 }
        );
      }
      updateData.creditValueCents = creditValueCents;
    }

    if (payoutFeeBps !== undefined) {
      if (!Number.isInteger(payoutFeeBps) || payoutFeeBps < 0 || payoutFeeBps > 2000) {
        return NextResponse.json(
          { error: "Processing fee percent must be between 0% and 20%" },
          { status: 400 }
        );
      }
      updateData.payoutFeeBps = payoutFeeBps;
    }

    if (payoutFeeFixedCents !== undefined) {
      if (
        !Number.isInteger(payoutFeeFixedCents) ||
        payoutFeeFixedCents < 0 ||
        payoutFeeFixedCents > 500
      ) {
        return NextResponse.json(
          { error: "Fixed processing fee must be between 0¢ and 500¢" },
          { status: 400 }
        );
      }
      updateData.payoutFeeFixedCents = payoutFeeFixedCents;
    }

    const settings = await prisma.platformSetting.upsert({
      where: { id: "default" },
      update: updateData,
      create: {
        id: "default",
        creatorPayoutRate: creatorPayoutRate ?? DEFAULT_PAYOUT_CENTS_PER_CREDIT,
        creditValueCents: creditValueCents ?? 10,
        payoutFeeBps: payoutFeeBps ?? DEFAULT_PAYOUT_FEE_BPS,
        payoutFeeFixedCents: payoutFeeFixedCents ?? DEFAULT_PAYOUT_FEE_FIXED_CENTS,
        moderatorIds: [],
        updatedBy: authUser.id,
      },
    });

    return NextResponse.json({
      settings: {
        creatorPayoutRate: settings.creatorPayoutRate,
        creditValueCents: settings.creditValueCents,
        payoutFeeBps: settings.payoutFeeBps,
        payoutFeeFixedCents: settings.payoutFeeFixedCents,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/settings error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

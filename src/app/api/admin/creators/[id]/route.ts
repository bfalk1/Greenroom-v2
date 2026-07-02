import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  resolveCentsPerCredit,
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
} from "@/lib/payoutMath";

// GET /api/admin/creators/[id] - Get creator details including custom payout rate
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (dbUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const creator = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        customPayoutRate: true,
        isWhitelisted: true,
        createdAt: true,
        _count: {
          select: {
            samples: true,
          },
        },
      },
    });

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // Get platform default rate
    const settings = await prisma.platformSetting.findUnique({
      where: { id: "default" },
      select: { creatorPayoutRate: true },
    });

    const platformDefaultRate =
      settings?.creatorPayoutRate ?? DEFAULT_PAYOUT_CENTS_PER_CREDIT;

    return NextResponse.json({
      creator,
      // Rates are CENTS PER CREDIT (e.g. 7 = $0.07/credit), not percentages.
      platformDefaultRate,
      effectiveRate: resolveCentsPerCredit(
        creator.customPayoutRate,
        platformDefaultRate
      ),
    });
  } catch (error) {
    console.error("Error fetching creator:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/creators/[id] - Update creator settings (custom payout rate, whitelist)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (dbUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { customPayoutRate, isWhitelisted } = body;

    const updateData: Record<string, unknown> = {};

    if (customPayoutRate !== undefined) {
      // null means use platform default
      if (customPayoutRate === null) {
        updateData.customPayoutRate = null;
      } else {
        const rate = parseInt(customPayoutRate);
        if (isNaN(rate) || rate < 0 || rate > 50) {
          return NextResponse.json(
            { error: "Payout rate must be between 0 and 50 cents per credit" },
            { status: 400 }
          );
        }
        updateData.customPayoutRate = rate;
      }
    }

    if (isWhitelisted !== undefined) {
      updateData.isWhitelisted = Boolean(isWhitelisted);
    }

    const creator = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        customPayoutRate: true,
        isWhitelisted: true,
      },
    });

    // Log the change
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATOR_SETTINGS_UPDATED",
        targetType: "User",
        targetId: id,
        metadata: updateData as Record<string, string | number | boolean | null>,
      },
    });

    return NextResponse.json({ creator });
  } catch (error) {
    console.error("Error updating creator:", error);
    return NextResponse.json(
      { error: "Failed to update creator" },
      { status: 500 }
    );
  }
}

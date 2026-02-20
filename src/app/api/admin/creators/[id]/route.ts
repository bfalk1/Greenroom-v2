import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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
        stripeConnectId: true,
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

    return NextResponse.json({
      creator,
      platformDefaultRate: settings?.creatorPayoutRate || 70,
      effectiveRate: creator.customPayoutRate ?? settings?.creatorPayoutRate ?? 70,
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
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return NextResponse.json(
            { error: "Payout rate must be between 0 and 100" },
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
        metadata: updateData,
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

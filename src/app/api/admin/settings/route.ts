import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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
          creatorPayoutRate: 70,
          creditValueCents: 10,
          moderatorIds: [],
        },
      });
    }

    // Get moderator details
    const moderators = settings.moderatorIds.length > 0
      ? await prisma.user.findMany({
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
      : [];

    return NextResponse.json({
      settings: {
        creatorPayoutRate: settings.creatorPayoutRate,
        creditValueCents: settings.creditValueCents,
        moderatorIds: settings.moderatorIds,
      },
      moderators,
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
    const { creatorPayoutRate, creditValueCents } = body;

    const updateData: {
      creatorPayoutRate?: number;
      creditValueCents?: number;
      updatedBy: string;
    } = {
      updatedBy: authUser.id,
    };

    if (creatorPayoutRate !== undefined) {
      if (creatorPayoutRate < 0 || creatorPayoutRate > 100) {
        return NextResponse.json(
          { error: "Payout rate must be between 0 and 100" },
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

    const settings = await prisma.platformSetting.upsert({
      where: { id: "default" },
      update: updateData,
      create: {
        id: "default",
        creatorPayoutRate: creatorPayoutRate ?? 70,
        creditValueCents: creditValueCents ?? 10,
        moderatorIds: [],
        updatedBy: authUser.id,
      },
    });

    return NextResponse.json({
      settings: {
        creatorPayoutRate: settings.creatorPayoutRate,
        creditValueCents: settings.creditValueCents,
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

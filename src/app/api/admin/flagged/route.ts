import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/flagged - Get flagged accounts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (dbUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const [flaggedUsers, total] = await Promise.all([
      prisma.user.findMany({
        where: { isFlagged: true },
        select: {
          id: true,
          email: true,
          username: true,
          artistName: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          isFlagged: true,
          flagReason: true,
          flaggedAt: true,
          flaggedBy: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              samples: true,
              purchases: true,
            },
          },
        },
        orderBy: { flaggedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where: { isFlagged: true } }),
    ]);

    // Get flagger names
    const flaggedByIds = flaggedUsers
      .map(u => u.flaggedBy)
      .filter(Boolean) as string[];

    const flaggers = flaggedByIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: flaggedByIds } },
          select: { id: true, username: true, artistName: true, fullName: true },
        })
      : [];

    const flaggerMap = new Map(flaggers.map(f => [f.id, f]));

    const usersWithFlaggers = flaggedUsers.map(u => ({
      ...u,
      flagger: u.flaggedBy ? flaggerMap.get(u.flaggedBy) : null,
    }));

    return NextResponse.json({
      users: usersWithFlaggers,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching flagged users:", error);
    return NextResponse.json(
      { error: "Failed to fetch flagged users" },
      { status: 500 }
    );
  }
}

// POST /api/admin/flagged - Resolve a flagged account
export async function POST(request: NextRequest) {
  try {
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
    const { userId, action, note } = body;

    if (!userId || !action) {
      return NextResponse.json(
        { error: "userId and action are required" },
        { status: 400 }
      );
    }

    if (action === "unflag") {
      // Clear the flag
      await prisma.user.update({
        where: { id: userId },
        data: {
          isFlagged: false,
          flagReason: null,
          flaggedAt: null,
          flaggedBy: null,
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "USER_UNFLAGGED",
          targetType: "User",
          targetId: userId,
          metadata: { note },
        },
      });

      return NextResponse.json({ success: true, action: "unflagged" });
    } else if (action === "suspend") {
      // Suspend the account
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          isFlagged: false,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "USER_SUSPENDED",
          targetType: "User",
          targetId: userId,
          metadata: { note },
        },
      });

      return NextResponse.json({ success: true, action: "suspended" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error resolving flagged user:", error);
    return NextResponse.json(
      { error: "Failed to resolve flagged user" },
      { status: 500 }
    );
  }
}

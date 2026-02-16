import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/users?search=query — Search users
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    if (!search.trim()) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
          { artistName: { contains: search, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        artistName: true,
        avatarUrl: true,
        credits: true,
        role: true,
        payoutRate: true,
        createdAt: true,
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users — Update user (role, credits, payoutRate)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, role, creditAdjustment, payoutRate } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: {
      role?: string;
      credits?: number;
      payoutRate?: number | null;
    } = {};

    // Role change
    if (role !== undefined) {
      const validRoles = ["USER", "CREATOR", "MODERATOR", "ADMIN"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updateData.role = role;
    }

    // Credit adjustment
    if (creditAdjustment !== undefined) {
      const adjustment = parseInt(creditAdjustment);
      if (isNaN(adjustment)) {
        return NextResponse.json({ error: "Invalid credit adjustment" }, { status: 400 });
      }
      const newCredits = Math.max(0, targetUser.credits + adjustment);
      updateData.credits = newCredits;
    }

    // Payout rate (for creators)
    if (payoutRate !== undefined) {
      if (payoutRate === null || payoutRate === "") {
        updateData.payoutRate = null; // Use platform default
      } else {
        const rate = parseInt(payoutRate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return NextResponse.json(
            { error: "Payout rate must be 0-100 or empty for default" },
            { status: 400 }
          );
        }
        updateData.payoutRate = rate;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        artistName: true,
        credits: true,
        role: true,
        payoutRate: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("PATCH /api/admin/users error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

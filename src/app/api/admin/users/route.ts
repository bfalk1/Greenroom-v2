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
        creditBalance: { select: { balance: true } },
        role: true,
        payoutRate: true,
        isWhitelisted: true,
        createdAt: true,
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    // Flatten creditBalance.balance to a `credits` field so the admin panel
    // doesn't need to know about the underlying schema.
    const flattened = users.map(({ creditBalance, ...rest }) => ({
      ...rest,
      credits: creditBalance?.balance ?? 0,
    }));

    return NextResponse.json({ users: flattened });
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
    const { userId, role, creditAdjustment, payoutRate, artistName, username } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        creditBalance: { select: { balance: true } },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: {
      role?: "USER" | "CREATOR" | "MODERATOR" | "ADMIN";
      payoutRate?: number | null;
      artistName?: string | null;
      username?: string | null;
    } = {};

    let creditsTarget: number | undefined;

    // Role change
    if (role !== undefined) {
      const validRoles = ["USER", "CREATOR", "MODERATOR", "ADMIN"] as const;
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updateData.role = role as "USER" | "CREATOR" | "MODERATOR" | "ADMIN";
    }

    // Credit adjustment — written to creditBalance only (single source of truth).
    if (creditAdjustment !== undefined) {
      const adjustment = parseInt(creditAdjustment);
      if (isNaN(adjustment)) {
        return NextResponse.json({ error: "Invalid credit adjustment" }, { status: 400 });
      }
      creditsTarget = Math.max(0, (targetUser.creditBalance?.balance ?? 0) + adjustment);
    }

    // Payout rate (cents per credit for creators)
    // Default is $0.03/credit (3 cents). Admin can override.
    if (payoutRate !== undefined) {
      if (payoutRate === null || payoutRate === "") {
        updateData.payoutRate = null; // Use default ($0.03/credit)
      } else {
        const rate = parseInt(payoutRate);
        if (isNaN(rate) || rate < 1 || rate > 50) {
          return NextResponse.json(
            { error: "Payout rate must be 1-50 cents per credit, or empty for default ($0.03)" },
            { status: 400 }
          );
        }
        updateData.payoutRate = rate;
      }
    }

    // Username (login handle; unique in the DB, lowercase alphanumeric + underscore)
    if (username !== undefined) {
      if (username === null || username === "") {
        updateData.username = null;
      } else if (typeof username !== "string") {
        return NextResponse.json({ error: "Invalid username" }, { status: 400 });
      } else {
        const trimmed = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(trimmed)) {
          return NextResponse.json(
            { error: "Username must be 3–30 characters, lowercase letters, numbers, or underscores" },
            { status: 400 }
          );
        }
        updateData.username = trimmed;
      }
    }

    // Artist name (used by creators; unique in the DB)
    if (artistName !== undefined) {
      if (artistName === null || artistName === "") {
        updateData.artistName = null;
      } else if (typeof artistName !== "string") {
        return NextResponse.json({ error: "Invalid artist name" }, { status: 400 });
      } else {
        const trimmed = artistName.trim();
        if (trimmed.length < 1 || trimmed.length > 60) {
          return NextResponse.json(
            { error: "Artist name must be 1–60 characters" },
            { status: 400 }
          );
        }
        updateData.artistName = trimmed;
      }
    }

    let updatedUser;
    try {
      // Wrap user.update + creditBalance update in a transaction so role and
      // credit changes commit together.
      updatedUser = await prisma.$transaction(async (tx) => {
        const hasUserUpdates = Object.keys(updateData).length > 0;
        const updated = hasUserUpdates
          ? await tx.user.update({
              where: { id: userId },
              data: updateData,
              select: {
                id: true,
                email: true,
                username: true,
                fullName: true,
                artistName: true,
                avatarUrl: true,
                role: true,
                payoutRate: true,
                isWhitelisted: true,
                creditBalance: { select: { balance: true } },
              },
            })
          : await tx.user.findUniqueOrThrow({
              where: { id: userId },
              select: {
                id: true,
                email: true,
                username: true,
                fullName: true,
                artistName: true,
                avatarUrl: true,
                role: true,
                payoutRate: true,
                isWhitelisted: true,
                creditBalance: { select: { balance: true } },
              },
            });

        if (creditsTarget !== undefined) {
          const synced = await tx.creditBalance.upsert({
            where: { userId },
            create: { userId, balance: creditsTarget },
            update: { balance: creditsTarget },
          });
          updated.creditBalance = { balance: synced.balance };
        }

        return updated;
      });
    } catch (err: unknown) {
      // Prisma unique-constraint violation (artistName and username are unique)
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
        const field = Array.isArray(target) ? target[0] : target;
        const label = field === "username" ? "username" : "artist name";
        return NextResponse.json(
          { error: `That ${label} is already taken` },
          { status: 409 }
        );
      }
      throw err;
    }

    const { creditBalance, ...rest } = updatedUser;
    return NextResponse.json({
      user: { ...rest, credits: creditBalance?.balance ?? 0 },
    });
  } catch (error) {
    console.error("PATCH /api/admin/users error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

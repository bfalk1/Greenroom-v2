import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { Prisma } from "@prisma/client";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// GET /api/admin/creators — Paginated list of ALL creators with payout rates.
// Query params: limit (1-100, default 25), offset (default 0),
// search (optional, matches email/username/artistName case-insensitively).
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
    const rawOffset = parseInt(searchParams.get("offset") ?? "", 10);
    const limit = Number.isNaN(rawLimit)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
    const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);
    const search = (searchParams.get("search") ?? "").trim();

    const where: Prisma.UserWhereInput = {
      role: "CREATOR",
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
              { artistName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [creators, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          artistName: true,
          avatarUrl: true,
          customPayoutRate: true,
          _count: {
            select: {
              samples: { where: { status: "PUBLISHED" } },
            },
          },
        },
        orderBy: [
          { artistName: { sort: "asc", nulls: "last" } },
          { email: "asc" },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      creators: creators.map(({ _count, ...rest }) => ({
        ...rest,
        publishedSamples: _count.samples,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/admin/creators error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creators" },
      { status: 500 }
    );
  }
}

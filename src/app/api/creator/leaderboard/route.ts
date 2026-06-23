import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/creator/leaderboard?month=YYYY-MM
// Monthly creator leaderboard: uploads (samples + presets) and sales (credits).
// Visible to creators and admins only.
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

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // Resolve the month window. Defaults to the current month.
    const monthParam = request.nextUrl.searchParams.get("month");
    const now = new Date();
    let year = now.getFullYear();
    let monthIndex = now.getMonth();
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      year = y;
      monthIndex = m - 1;
    }
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 1);
    const dateFilter = { gte: monthStart, lt: monthEnd };

    // Uploads exclude private drafts so the board can't be padded with
    // never-published items. Sales count every purchase in the window.
    const [sampleUploads, presetUploads, purchases] = await Promise.all([
      prisma.sample.groupBy({
        by: ["creatorId"],
        where: {
          createdAt: dateFilter,
          isActive: true,
          status: { in: ["PUBLISHED", "REVIEW"] },
        },
        _count: { _all: true },
      }),
      prisma.preset.groupBy({
        by: ["creatorId"],
        where: {
          createdAt: dateFilter,
          isActive: true,
          status: { in: ["PUBLISHED", "REVIEW"] },
        },
        _count: { _all: true },
      }),
      prisma.purchase.findMany({
        where: { createdAt: dateFilter },
        select: {
          creditsSpent: true,
          sample: { select: { creatorId: true } },
          preset: { select: { creatorId: true } },
        },
      }),
    ]);

    // Aggregate per creator.
    type Agg = { uploads: number; salesCredits: number };
    const byCreator = new Map<string, Agg>();
    const bump = (id: string | null | undefined, field: keyof Agg, amount: number) => {
      if (!id || amount === 0) return;
      const cur = byCreator.get(id) ?? { uploads: 0, salesCredits: 0 };
      cur[field] += amount;
      byCreator.set(id, cur);
    };

    sampleUploads.forEach((r) => bump(r.creatorId, "uploads", r._count._all));
    presetUploads.forEach((r) => bump(r.creatorId, "uploads", r._count._all));
    purchases.forEach((p) =>
      bump(p.sample?.creatorId ?? p.preset?.creatorId, "salesCredits", p.creditsSpent)
    );

    const creatorIds = [...byCreator.keys()];
    const monthString = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const monthLabel = monthStart.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    if (creatorIds.length === 0) {
      return NextResponse.json({
        month: monthString,
        monthLabel,
        currentUserId: authUser.id,
        rows: [],
      });
    }

    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, artistName: true, username: true, avatarUrl: true },
    });
    const userMap = new Map(creators.map((u) => [u.id, u]));

    const rows = creatorIds
      .map((id) => {
        const agg = byCreator.get(id)!;
        const u = userMap.get(id);
        return {
          creatorId: id,
          displayName: u?.artistName || u?.username || "Unknown Artist",
          avatarUrl: u?.avatarUrl ?? null,
          uploads: agg.uploads,
          salesCredits: agg.salesCredits,
        };
      })
      // Default order: top sellers first, uploads as the tiebreaker.
      .sort((a, b) => b.salesCredits - a.salesCredits || b.uploads - a.uploads);

    return NextResponse.json({
      month: monthString,
      monthLabel,
      currentUserId: authUser.id,
      rows,
    });
  } catch (error) {
    console.error("GET /api/creator/leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/creator-uploads
//   List mode  (default, optional ?search=):
//     → creators (role CREATOR) with their upload counts, status breakdown,
//       total downloads, and last-upload timestamp. Sorted by total uploads.
//   Detail mode (?creatorId=<uuid>):
//     → a single creator plus their full upload history (every sample) and a
//       summary of counts by status.
// ADMIN only.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

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
    const creatorId = searchParams.get("creatorId");

    // ── Detail mode ────────────────────────────────────────────────
    if (creatorId) {
      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
        select: {
          id: true,
          email: true,
          username: true,
          artistName: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
        },
      });

      if (!creator) {
        return NextResponse.json({ error: "Creator not found" }, { status: 404 });
      }

      const samples = await prisma.sample.findMany({
        where: { creatorId },
        select: {
          id: true,
          name: true,
          slug: true,
          genre: true,
          instrumentType: true,
          sampleType: true,
          key: true,
          bpm: true,
          creditPrice: true,
          durationMs: true,
          fileSizeBytes: true,
          downloadCount: true,
          ratingAvg: true,
          ratingCount: true,
          status: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // BigInt (fileSizeBytes) isn't JSON-serializable — coerce to Number.
      const serializedSamples = samples.map((s) => ({
        ...s,
        fileSizeBytes: s.fileSizeBytes != null ? Number(s.fileSizeBytes) : null,
      }));

      const summary = {
        total: samples.length,
        published: samples.filter((s) => s.status === "PUBLISHED").length,
        review: samples.filter((s) => s.status === "REVIEW").length,
        draft: samples.filter((s) => s.status === "DRAFT").length,
        totalDownloads: samples.reduce((sum, s) => sum + s.downloadCount, 0),
      };

      return NextResponse.json({ creator, samples: serializedSamples, summary });
    }

    // ── List mode ──────────────────────────────────────────────────
    const search = (searchParams.get("search") || "").trim();

    const creators = await prisma.user.findMany({
      where: {
        role: "CREATOR",
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
                { fullName: { contains: search, mode: "insensitive" } },
                { artistName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
      },
      take: 500,
    });

    const creatorIds = creators.map((c) => c.id);

    // Per-creator totals: count, downloads, last upload.
    const totals = creatorIds.length
      ? await prisma.sample.groupBy({
          by: ["creatorId"],
          where: { creatorId: { in: creatorIds } },
          _count: { _all: true },
          _sum: { downloadCount: true },
          _max: { createdAt: true },
        })
      : [];

    // Per-creator status breakdown.
    const statusGroups = creatorIds.length
      ? await prisma.sample.groupBy({
          by: ["creatorId", "status"],
          where: { creatorId: { in: creatorIds } },
          _count: { _all: true },
        })
      : [];

    const totalsMap = new Map(totals.map((t) => [t.creatorId, t]));
    const statusMap = new Map<string, { published: number; review: number; draft: number }>();
    for (const g of statusGroups) {
      const entry = statusMap.get(g.creatorId) ?? { published: 0, review: 0, draft: 0 };
      if (g.status === "PUBLISHED") entry.published = g._count._all;
      else if (g.status === "REVIEW") entry.review = g._count._all;
      else if (g.status === "DRAFT") entry.draft = g._count._all;
      statusMap.set(g.creatorId, entry);
    }

    const result = creators
      .map((c) => {
        const t = totalsMap.get(c.id);
        const s = statusMap.get(c.id) ?? { published: 0, review: 0, draft: 0 };
        return {
          ...c,
          totalUploads: t?._count._all ?? 0,
          totalDownloads: t?._sum.downloadCount ?? 0,
          lastUploadAt: t?._max.createdAt ?? null,
          publishedCount: s.published,
          reviewCount: s.review,
          draftCount: s.draft,
        };
      })
      .sort((a, b) => b.totalUploads - a.totalUploads);

    return NextResponse.json({ creators: result });
  } catch (error) {
    console.error("GET /api/admin/creator-uploads error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator uploads" },
      { status: 500 }
    );
  }
}

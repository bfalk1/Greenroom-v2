import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/search/suggestions?q=<term> — lightweight autocomplete suggestions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";

    if (q.length < 2) {
      return NextResponse.json({ samples: [], creators: [], tags: [], genres: [] });
    }

    const qLower = q.toLowerCase();

    const [samples, creators, genres, tagsResult] = await Promise.all([
      // Top 5 matching samples by name
      prisma.sample.findMany({
        where: {
          status: "PUBLISHED",
          isActive: true,
          name: { contains: q, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          genre: true,
          creator: {
            select: { artistName: true },
          },
        },
        orderBy: { downloadCount: "desc" },
        take: 5,
      }),

      // Top 3 matching creators
      prisma.user.findMany({
        where: {
          role: { in: ["CREATOR", "ADMIN"] },
          isActive: true,
          OR: [
            { artistName: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          artistName: true,
          username: true,
          avatarUrl: true,
        },
        take: 3,
      }),

      // Top 3 matching genres
      prisma.genre.findMany({
        where: {
          isActive: true,
          name: { contains: q, mode: "insensitive" },
        },
        orderBy: { usageCount: "desc" },
        select: { name: true },
        take: 3,
      }),

      // Top 5 matching tags from published samples
      prisma.sample.findMany({
        where: {
          status: "PUBLISHED",
          isActive: true,
          tags: { hasSome: [qLower] },
        },
        select: { tags: true },
        take: 20,
      }),
    ]);

    // Extract unique matching tags
    const allTags = tagsResult.flatMap((s) => s.tags);
    const matchingTags = [...new Set(allTags)]
      .filter((t) => t.toLowerCase().includes(qLower))
      .slice(0, 5);

    return NextResponse.json({
      samples: samples.map((s) => ({
        id: s.id,
        name: s.name,
        genre: s.genre,
        creatorName: s.creator.artistName,
      })),
      creators: creators.map((c) => ({
        id: c.id,
        artistName: c.artistName,
        username: c.username,
        avatarUrl: c.avatarUrl,
      })),
      tags: matchingTags,
      genres: genres.map((g) => g.name),
    });
  } catch (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}

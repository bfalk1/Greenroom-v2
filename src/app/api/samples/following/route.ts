import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/samples/following — Get samples from followed creators
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ samples: [], total: 0 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get IDs of creators the user follows
    const follows = await prisma.follow.findMany({
      where: { followerId: authUser.id },
      select: { creatorId: true },
    });

    if (follows.length === 0) {
      return NextResponse.json({ samples: [], total: 0, following: 0 });
    }

    const creatorIds = follows.map((f) => f.creatorId);

    // Get samples from followed creators
    const [samples, total] = await Promise.all([
      prisma.sample.findMany({
        where: {
          creatorId: { in: creatorIds },
          status: "PUBLISHED",
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          creator: {
            select: {
              id: true,
              artistName: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.sample.count({
        where: {
          creatorId: { in: creatorIds },
          status: "PUBLISHED",
          isActive: true,
        },
      }),
    ]);

    // Map to frontend format
    const mapped = samples.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      creator_id: s.creatorId,
      artist_name: s.creator.artistName || s.creator.username || "Unknown",
      creator_avatar: s.creator.avatarUrl,
      genre: s.genre,
      instrument_type: s.instrumentType,
      sample_type: s.sampleType,
      key: s.key,
      bpm: s.bpm,
      credit_price: s.creditPrice,
      tags: s.tags,
      file_url: s.previewUrl || s.fileUrl,
      cover_art_url: s.coverImageUrl,
      average_rating: s.ratingAvg,
      total_ratings: s.ratingCount,
      total_purchases: s.downloadCount,
      total_downloads: s.downloadCount,
      created_date: s.createdAt.toISOString(),
    }));

    return NextResponse.json({
      samples: mapped,
      total,
      following: follows.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/samples/following error:", error);
    return NextResponse.json(
      { error: "Failed to fetch samples" },
      { status: 500 }
    );
  }
}

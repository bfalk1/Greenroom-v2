import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/favorites — Get user's favorited samples (and preset IDs)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch sample favorites (existing behavior)
    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId: authUser.id, sampleId: { not: null } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          sample: {
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
          },
        },
      }),
      prisma.favorite.count({ where: { userId: authUser.id, sampleId: { not: null } } }),
    ]);

    // Map to frontend format
    const samples = favorites
      .filter((f) => f.sample && f.sample.status === "PUBLISHED" && f.sample.isActive)
      .map((f) => ({
        id: f.sample!.id,
        name: f.sample!.name,
        slug: f.sample!.slug,
        creator_id: f.sample!.creatorId,
        artist_name: f.sample!.creator.artistName || f.sample!.creator.username || "Unknown",
        creator_avatar: f.sample!.creator.avatarUrl,
        genre: f.sample!.genre,
        instrument_type: f.sample!.instrumentType,
        sample_type: f.sample!.sampleType,
        key: f.sample!.key,
        bpm: f.sample!.bpm,
        credit_price: f.sample!.creditPrice,
        tags: f.sample!.tags,
        file_url: f.sample!.previewUrl || f.sample!.fileUrl,
        cover_art_url: f.sample!.coverImageUrl,
        average_rating: f.sample!.ratingAvg,
        total_ratings: f.sample!.ratingCount,
        total_purchases: f.sample!.downloadCount,
        total_downloads: f.sample!.downloadCount,
        created_date: f.sample!.createdAt.toISOString(),
        favorited_at: f.createdAt.toISOString(),
      }));

    // Get all favorite IDs for quick lookup
    const allFavorites = await prisma.favorite.findMany({
      where: { userId: authUser.id },
      select: { sampleId: true, presetId: true },
    });

    return NextResponse.json({
      samples,
      sampleIds: allFavorites.filter(f => f.sampleId).map((f) => f.sampleId as string),
      presetIds: allFavorites.filter(f => f.presetId).map((f) => f.presetId as string),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/favorites error:", error);
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 }
    );
  }
}

// POST /api/favorites — Toggle favorite for sample or preset
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sampleId, presetId } = body;

    if (!sampleId && !presetId) {
      return NextResponse.json(
        { error: "sampleId or presetId is required" },
        { status: 400 }
      );
    }

    if (sampleId) {
      // Sample favorite toggle
      const sample = await prisma.sample.findUnique({
        where: { id: sampleId },
      });

      if (!sample || sample.status !== "PUBLISHED" || !sample.isActive) {
        return NextResponse.json(
          { error: "Sample not found" },
          { status: 404 }
        );
      }

      const existing = await prisma.favorite.findUnique({
        where: {
          userId_sampleId: {
            userId: authUser.id,
            sampleId,
          },
        },
      });

      if (existing) {
        await prisma.favorite.delete({ where: { id: existing.id } });
        return NextResponse.json({ favorited: false, sampleId });
      } else {
        await prisma.favorite.create({
          data: { userId: authUser.id, sampleId },
        });
        return NextResponse.json({ favorited: true, sampleId });
      }
    } else {
      // Preset favorite toggle
      const preset = await prisma.preset.findUnique({
        where: { id: presetId },
      });

      if (!preset || preset.status !== "PUBLISHED" || !preset.isActive) {
        return NextResponse.json(
          { error: "Preset not found" },
          { status: 404 }
        );
      }

      const existing = await prisma.favorite.findFirst({
        where: {
          userId: authUser.id,
          presetId,
        },
      });

      if (existing) {
        await prisma.favorite.delete({ where: { id: existing.id } });
        return NextResponse.json({ favorited: false, presetId });
      } else {
        await prisma.favorite.create({
          data: { userId: authUser.id, presetId },
        });
        return NextResponse.json({ favorited: true, presetId });
      }
    }
  } catch (error) {
    console.error("POST /api/favorites error:", error);
    return NextResponse.json(
      { error: "Failed to update favorite" },
      { status: 500 }
    );
  }
}

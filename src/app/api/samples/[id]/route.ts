import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/samples/[id] — Public, return single sample
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const sample = await prisma.sample.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            artistName: true,
            username: true,
            avatarUrl: true,
            bio: true,
          },
        },
      },
    });

    if (!sample) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    const mapped = {
      id: sample.id,
      name: sample.name,
      slug: sample.slug,
      creator_id: sample.creatorId,
      artist_name:
        sample.creator.artistName || sample.creator.username || "Unknown",
      creator_avatar: sample.creator.avatarUrl,
      creator_bio: sample.creator.bio,
      genre: sample.genre,
      instrument_type: sample.instrumentType,
      sample_type: sample.sampleType,
      key: sample.key,
      bpm: sample.bpm,
      credit_price: sample.creditPrice,
      tags: sample.tags,
      file_url: sample.previewUrl || sample.fileUrl,
      cover_art_url: sample.coverImageUrl,
      average_rating: sample.ratingAvg,
      total_ratings: sample.ratingCount,
      total_purchases: sample.downloadCount,
      total_downloads: sample.downloadCount,
      status: sample.status,
      created_date: sample.createdAt.toISOString(),
    };

    return NextResponse.json({ sample: mapped });
  } catch (error) {
    console.error("GET /api/samples/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sample" },
      { status: 500 }
    );
  }
}

// PUT /api/samples/[id] — Auth required, must be sample creator
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.sample.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    if (existing.creatorId !== authUser.id) {
      return NextResponse.json(
        { error: "You can only edit your own samples" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const allowedFields = [
      "name",
      "genre",
      "instrumentType",
      "sampleType",
      "key",
      "bpm",
      "creditPrice",
      "tags",
      "coverImageUrl",
      "status",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "bpm" || field === "creditPrice") {
          updateData[field] = parseInt(body[field]);
        } else if (field === "tags" && typeof body[field] === "string") {
          updateData[field] = body[field]
            .split(",")
            .map((t: string) => t.trim().toLowerCase());
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await prisma.sample.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ sample: updated });
  } catch (error) {
    console.error("PUT /api/samples/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update sample" },
      { status: 500 }
    );
  }
}

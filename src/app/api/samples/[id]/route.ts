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

// PUT /api/samples/[id] — CREATOR can edit own samples only
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

    // Must be CREATOR role
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Only creators can edit samples" },
        { status: 403 }
      );
    }

    const existing = await prisma.sample.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    // Creator can only edit their OWN samples
    if (existing.creatorId !== authUser.id) {
      return NextResponse.json(
        { error: "You can only edit your own samples" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Creators cannot publish their own samples - must go through moderation
    if (body.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "Samples must be approved by a moderator to be published" },
        { status: 403 }
      );
    }

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
      "isActive",
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

// DELETE /api/samples/[id] — CREATOR can delete own samples only
export async function DELETE(
  _request: NextRequest,
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

    // Must be CREATOR role
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Only creators can delete samples" },
        { status: 403 }
      );
    }

    const existing = await prisma.sample.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    // Creator can only delete their OWN samples
    if (existing.creatorId !== authUser.id) {
      return NextResponse.json(
        { error: "You can only delete your own samples" },
        { status: 403 }
      );
    }

    // Delete related records first (cascade)
    // Get purchase IDs for this sample
    const purchases = await prisma.purchase.findMany({
      where: { sampleId: id },
      select: { id: true },
    });
    const purchaseIds = purchases.map((p) => p.id);

    // Delete downloads linked to these purchases
    if (purchaseIds.length > 0) {
      await prisma.download.deleteMany({
        where: { purchaseId: { in: purchaseIds } },
      });
    }

    // Delete purchases, ratings, favorites for this sample
    await prisma.purchase.deleteMany({ where: { sampleId: id } });
    await prisma.rating.deleteMany({ where: { sampleId: id } });
    await prisma.favorite.deleteMany({ where: { sampleId: id } });

    // Now delete the sample
    await prisma.sample.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Sample deleted" });
  } catch (error) {
    console.error("DELETE /api/samples/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete sample" },
      { status: 500 }
    );
  }
}

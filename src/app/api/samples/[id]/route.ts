import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/samples/[id] — Public for PUBLISHED samples; DRAFT/REVIEW are visible
// only to the owning creator or a MODERATOR/ADMIN.
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

    // Only published, active samples are public. For anything pre-publication
    // (DRAFT/REVIEW or deactivated), require the viewer to be the owner or a
    // moderator/admin — and 404 (not 403) so we don't confirm the id exists.
    const isPublic = sample.status === "PUBLISHED" && sample.isActive;
    if (!isPublic) {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let allowed = false;
      if (authUser) {
        if (authUser.id === sample.creatorId) {
          allowed = true;
        } else {
          const viewer = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { role: true },
          });
          allowed = viewer?.role === "MODERATOR" || viewer?.role === "ADMIN";
        }
      }

      if (!allowed) {
        return NextResponse.json({ error: "Sample not found" }, { status: 404 });
      }
    }

    // Never expose the raw private `samples/` storage path. Hand back a
    // short-lived signed URL to the public MP3 preview when one exists.
    let previewSignedUrl: string | null = null;
    if (sample.previewUrl?.startsWith("previews/")) {
      const { createClient: createServiceClient } = await import(
        "@supabase/supabase-js"
      );
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data } = await serviceClient.storage
        .from("previews")
        .createSignedUrl(sample.previewUrl.replace("previews/", ""), 3600);
      previewSignedUrl = data?.signedUrl ?? null;
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
      file_url: previewSignedUrl,
      preview_url: previewSignedUrl,
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
      select: { role: true, isWhitelisted: true },
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

    // A moderator takedown is terminal — the creator can't edit, reactivate, or
    // resubmit a REMOVED sample (only an admin/moderator can restore it).
    if (existing.status === "REMOVED") {
      return NextResponse.json(
        { error: "This sample was removed by a moderator and can no longer be edited." },
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

    // Credit price drives how many credits a buyer is charged (and, when
    // negative, would be *added* to their balance). Validate it the same way
    // POST does: a positive integer no greater than the creator's cap.
    if (body.creditPrice !== undefined) {
      const price = parseInt(body.creditPrice);
      const maxCreditPrice = dbUser.isWhitelisted ? 50 : 5;
      if (!Number.isInteger(price) || price < 1 || price > maxCreditPrice) {
        return NextResponse.json(
          { error: `Credit price must be a whole number between 1 and ${maxCreditPrice}` },
          { status: 400 }
        );
      }
    }
    if (body.bpm !== undefined && body.bpm !== null && body.bpm !== "") {
      const bpm = parseInt(body.bpm);
      if (!Number.isInteger(bpm) || bpm < 1 || bpm > 1000) {
        return NextResponse.json(
          { error: "BPM must be a whole number between 1 and 1000" },
          { status: 400 }
        );
      }
    }

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

    // Delete the sample and every dependent row atomically. Done in a single
    // transaction so a mid-cascade failure can't leave the sample live while its
    // buyers' purchase/ownership/download history is already gone (or vice
    // versa) — that state is unrecoverable. Order respects FK dependencies:
    // downloads -> purchases -> ratings/favorites -> sample.
    await prisma.$transaction(async (tx) => {
      await tx.download.deleteMany({ where: { sampleId: id } });
      await tx.purchase.deleteMany({ where: { sampleId: id } });
      await tx.rating.deleteMany({ where: { sampleId: id } });
      await tx.favorite.deleteMany({ where: { sampleId: id } });
      await tx.sample.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, message: "Sample deleted" });
  } catch (error) {
    console.error("DELETE /api/samples/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete sample" },
      { status: 500 }
    );
  }
}

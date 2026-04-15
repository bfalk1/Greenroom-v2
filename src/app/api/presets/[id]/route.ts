import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/presets/[id] — Get single preset detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const preset = await prisma.preset.findUnique({
      where: { id },
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
    });

    if (!preset || !preset.isActive || preset.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json({
      preset: {
        id: preset.id,
        name: preset.name,
        slug: preset.slug,
        description: preset.description,
        creator_id: preset.creatorId,
        artist_name: preset.creator.artistName || preset.creator.username || "Unknown",
        creator_avatar: preset.creator.avatarUrl,
        synth_name: preset.synthName,
        preset_category: preset.presetCategory,
        genre: preset.genre,
        tags: preset.tags,
        credit_price: preset.creditPrice,
        cover_image_url: preset.coverImageUrl,
        compatible_versions: preset.compatibleVersions,
        parameter_snapshot: preset.parameterSnapshot,
        modulation_info: preset.modulationInfo,
        macro_descriptions: preset.macroDescriptions,
        is_init_preset: preset.isInitPreset,
        average_rating: preset.ratingAvg,
        total_ratings: preset.ratingCount,
        total_downloads: preset.downloadCount,
        created_date: preset.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("GET /api/presets/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch preset" },
      { status: 500 }
    );
  }
}

// PATCH /api/presets/[id] — Creator edit own preset
export async function PATCH(
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

    const preset = await prisma.preset.findUnique({
      where: { id },
    });

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    if (preset.creatorId !== authUser.id) {
      return NextResponse.json({ error: "Not your preset" }, { status: 403 });
    }

    const body = await request.json();
    const allowedFields = [
      "name", "description", "genre", "tags", "creditPrice",
      "previewUrl", "coverImageUrl", "compatibleVersions",
      "parameterSnapshot", "modulationInfo", "macroDescriptions",
      "isInitPreset",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "tags" && typeof body[field] === "string") {
          data[field] = body[field].split(",").map((t: string) => t.trim().toLowerCase());
        } else if (field === "creditPrice") {
          data[field] = parseInt(body[field]);
        } else {
          data[field] = body[field];
        }
      }
    }

    const updated = await prisma.preset.update({
      where: { id },
      data,
    });

    return NextResponse.json({ preset: updated });
  } catch (error) {
    console.error("PATCH /api/presets/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update preset" },
      { status: 500 }
    );
  }
}

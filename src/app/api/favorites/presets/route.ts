import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getPresetDownloadCounts } from "@/lib/downloadCounts";
import { NextRequest, NextResponse } from "next/server";

// Display names for synth / category enums — kept in sync with /api/presets so
// the favorites Presets tab renders identical labels to the marketplace.
const SYNTH_DISPLAY_NAMES: Record<string, string> = {
  SERUM: "Serum",
  ASTRA: "Astra",
  SERUM_2: "Serum 2",
  PHASE_PLANT: "Phase Plant",
  SPLICE: "Splice",
  VITAL: "Vital",
  SYLENTH1: "Sylenth1",
  MASSIVE: "Massive",
  BEAT_MAKER: "Beat Maker",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  BASS: "Bass",
  LEAD: "Lead",
  PAD: "Pad",
  PLUCK: "Pluck",
  FX: "FX",
  KEYS: "Keys",
  ARP: "Arp",
  SEQUENCE: "Sequence",
  OTHER: "Other",
};

// GET /api/favorites/presets — the caller's favorited presets, shaped like the
// marketplace Preset so the shared PresetRow renders them unchanged.
//
// Favoriting a preset has always written a row, but nothing ever read it back —
// /api/favorites returns sample rows plus a bare presetIds array, so a liked
// preset showed up only as a filled heart on the marketplace. This is the read
// side for the Library → Favorites tab.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = Math.max(0, Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000));
    const search = searchParams.get("search") || "";

    // Availability is part of the query (not a post-pagination filter) so
    // `total` matches what renders — same reason as the samples route.
    const presetWhere: Prisma.PresetWhereInput = {
      status: "PUBLISHED",
      isActive: true,
    };
    if (search) {
      presetWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { creator: { artistName: { contains: search, mode: "insensitive" } } },
        { genre: { contains: search, mode: "insensitive" } },
      ];
    }

    const where: Prisma.FavoriteWhereInput = {
      userId: authUser.id,
      presetId: { not: null },
      preset: presetWhere,
    };

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        include: {
          preset: {
            include: {
              creator: {
                select: {
                  artistName: true,
                  username: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.favorite.count({ where }),
    ]);

    // Batch-sign preview URLs (same private "previews" bucket the marketplace uses).
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const previewPaths = favorites.map((f) =>
      f.preset!.previewUrl?.startsWith("previews/")
        ? f.preset!.previewUrl!.replace("previews/", "")
        : null
    );

    const validPaths = previewPaths.filter((p): p is string => p !== null);
    const signedUrlMap: Record<string, string> = {};

    if (validPaths.length > 0) {
      const { data } = await serviceClient.storage
        .from("previews")
        .createSignedUrls(validPaths, 3600);

      if (data) {
        for (const item of data) {
          if (item.signedUrl && item.path) {
            signedUrlMap[item.path] = item.signedUrl;
          }
        }
      }
    }

    const previewUrls = previewPaths.map((path) =>
      path ? signedUrlMap[path] || null : null
    );

    // Real downloads — Preset.downloadCount is a purchase counter.
    const downloadsByPresetId = await getPresetDownloadCounts(
      favorites.flatMap((f) => (f.preset ? [f.preset.id] : []))
    );

    const presets = favorites.map((f, i) => {
      const preset = f.preset!;
      return {
        id: preset.id,
        name: preset.name,
        slug: preset.slug,
        description: preset.description,
        creator_id: preset.creatorId,
        artist_name: preset.creator.artistName || preset.creator.username || "Unknown",
        creator_avatar: preset.creator.avatarUrl,
        synth_name: preset.synthName,
        synth_display_name: SYNTH_DISPLAY_NAMES[preset.synthName] || preset.synthName,
        preset_category: preset.presetCategory,
        category_display_name:
          CATEGORY_DISPLAY_NAMES[preset.presetCategory] || preset.presetCategory,
        genre: preset.genre,
        tags: preset.tags,
        credit_price: preset.creditPrice,
        preview_url: previewUrls[i],
        cover_image_url: preset.coverImageUrl,
        compatible_versions: preset.compatibleVersions,
        is_init_preset: preset.isInitPreset,
        average_rating: preset.ratingAvg,
        total_ratings: preset.ratingCount,
        total_downloads: downloadsByPresetId.get(preset.id) ?? 0,
        created_date: preset.createdAt.toISOString(),
        favorited_at: f.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ presets, total, limit, offset });
  } catch (error) {
    console.error("Error fetching favorite presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch favorite presets" },
      { status: 500 }
    );
  }
}

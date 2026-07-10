import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

// Display names for synth / category enums — kept in sync with /api/presets so
// the library Presets tab renders identical labels to the marketplace.
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

// GET /api/library/presets — the caller's purchased presets, shaped like the
// marketplace Preset so the shared PresetRow renders them unchanged.
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

    const where: Prisma.PurchaseWhereInput = { userId: authUser.id, presetId: { not: null } };

    // Filters apply to the related preset; Prisma treats sibling keys as AND.
    const presetWhere: Prisma.PresetWhereInput = {};
    if (search) {
      presetWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { creator: { artistName: { contains: search, mode: "insensitive" } } },
        { genre: { contains: search, mode: "insensitive" } },
      ];
    }
    if (Object.keys(presetWhere).length > 0) {
      where.preset = presetWhere;
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
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
      prisma.purchase.count({ where }),
    ]);

    // Batch-sign preview URLs (same private "previews" bucket the marketplace uses).
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const previewPaths = purchases.map(p =>
      p.preset!.previewUrl?.startsWith("previews/")
        ? p.preset!.previewUrl!.replace("previews/", "")
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

    const previewUrls = previewPaths.map(path =>
      path ? signedUrlMap[path] || null : null
    );

    const presets = purchases.map((p, i) => {
      const preset = p.preset!;
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
        total_downloads: preset.downloadCount,
        created_date: preset.createdAt.toISOString(),
        purchased_at: p.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ presets, total, limit, offset });
  } catch (error) {
    console.error("Error fetching library presets:", error);
    return NextResponse.json(
      { error: "Failed to fetch library presets" },
      { status: 500 }
    );
  }
}

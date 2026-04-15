import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";

// Display names for synth enums
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

// GET /api/presets — Public, returns published presets with filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const synthName = searchParams.get("synthName") || "";
    const category = searchParams.get("category") || "";
    const genre = searchParams.get("genre") || "";
    const sortBy = searchParams.get("sortBy") || "popular";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.PresetWhereInput = {
      status: "PUBLISHED",
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { tags: { hasSome: [search.toLowerCase()] } },
        { description: { contains: search, mode: "insensitive" } },
        {
          creator: {
            OR: [
              { artistName: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    if (synthName && synthName !== "all") {
      where.synthName = synthName as Prisma.EnumSynthNameFilter["equals"];
    }

    if (category && category !== "all") {
      where.presetCategory = category as Prisma.EnumPresetCategoryFilter["equals"];
    }

    if (genre && genre !== "all") {
      where.genre = genre;
    }

    const useRandomSort = sortBy === "random" || !sortBy;

    let orderBy: Prisma.PresetOrderByWithRelationInput | undefined;
    if (!useRandomSort) {
      switch (sortBy) {
        case "name":
          orderBy = { name: sortDir };
          break;
        case "genre":
          orderBy = { genre: sortDir };
          break;
        case "artist":
          orderBy = { creator: { artistName: sortDir } };
          break;
        case "price":
          orderBy = { creditPrice: sortDir };
          break;
        case "rating":
          orderBy = { ratingAvg: sortDir };
          break;
        case "newest":
        case "recent":
          orderBy = { createdAt: "desc" };
          break;
        case "popular":
          orderBy = { downloadCount: "desc" };
          break;
        case "synth":
          orderBy = { synthName: sortDir };
          break;
        case "category":
          orderBy = { presetCategory: sortDir };
          break;
      }
    }

    let presets;
    let total: number;

    if (useRandomSort) {
      total = await prisma.preset.count({ where });
      const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60));

      const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };

      // Fetch a larger batch and shuffle
      const batchSize = Math.min(Math.max(limit * 3, 60), total);
      const maxSkip = Math.max(total - batchSize, 0);
      const skip = maxSkip === 0 ? 0 : Math.floor(seededRandom(hourSeed) * (maxSkip + 1));

      const rawPresets = await prisma.preset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: batchSize,
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

      const shuffled = [...rawPresets].sort((a, b) => {
        const seedA = hourSeed + a.id.charCodeAt(0) + a.id.charCodeAt(a.id.length - 1);
        const seedB = hourSeed + b.id.charCodeAt(0) + b.id.charCodeAt(b.id.length - 1);
        return seededRandom(seedA) - seededRandom(seedB);
      });

      presets = shuffled.slice(offset, offset + limit);
    } else {
      const [rawPresets, count] = await Promise.all([
        prisma.preset.findMany({
          where,
          orderBy,
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
        prisma.preset.count({ where }),
      ]);

      total = count;
      presets = rawPresets;
    }

    // Batch generate signed preview URLs
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const previewPaths = presets
      .map(p => p.previewUrl?.startsWith("previews/") ? p.previewUrl.replace("previews/", "") : null);

    const validPaths = previewPaths.filter((p): p is string => p !== null);

    let signedUrlMap: Record<string, string> = {};
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

    // Map to frontend format
    const mapped = presets.map((p, i) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      creator_id: p.creatorId,
      artist_name: p.creator.artistName || p.creator.username || "Unknown",
      creator_avatar: p.creator.avatarUrl,
      synth_name: p.synthName,
      synth_display_name: SYNTH_DISPLAY_NAMES[p.synthName] || p.synthName,
      preset_category: p.presetCategory,
      category_display_name: CATEGORY_DISPLAY_NAMES[p.presetCategory] || p.presetCategory,
      genre: p.genre,
      tags: p.tags,
      credit_price: p.creditPrice,
      preview_url: previewUrls[i],
      cover_image_url: p.coverImageUrl,
      compatible_versions: p.compatibleVersions,
      is_init_preset: p.isInitPreset,
      average_rating: p.ratingAvg,
      total_ratings: p.ratingCount,
      total_downloads: p.downloadCount,
      created_date: p.createdAt.toISOString(),
    }));

    return NextResponse.json({ presets: mapped, total, limit, offset });
  } catch (error) {
    console.error("GET /api/presets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch presets" },
      { status: 500 }
    );
  }
}

// POST /api/presets — Auth required, CREATOR role
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, role: true, isWhitelisted: true },
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Only creators can upload presets" },
        { status: 403 }
      );
    }

    const initialStatus = dbUser.isWhitelisted ? "PUBLISHED" : "REVIEW";

    const body = await request.json();
    const {
      name,
      description,
      synthName,
      presetCategory,
      genre,
      tags,
      creditPrice,
      fileUrl,
      previewUrl,
      coverImageUrl,
      compatibleVersions,
      parameterSnapshot,
      modulationInfo,
      macroDescriptions,
      isInitPreset,
      fileSizeBytes,
    } = body;

    if (!name || !synthName || !presetCategory || !genre || !fileUrl) {
      return NextResponse.json(
        { error: "Missing required fields: name, synthName, presetCategory, genre, fileUrl" },
        { status: 400 }
      );
    }

    if (!previewUrl) {
      return NextResponse.json(
        { error: "Audio preview is required for presets" },
        { status: 400 }
      );
    }

    // Validate enum values
    const validSynths = ["SERUM", "ASTRA", "SERUM_2", "PHASE_PLANT", "SPLICE", "VITAL", "SYLENTH1", "MASSIVE", "BEAT_MAKER"];
    if (!validSynths.includes(synthName)) {
      return NextResponse.json({ error: "Invalid synth name" }, { status: 400 });
    }

    const validCategories = ["BASS", "LEAD", "PAD", "PLUCK", "FX", "KEYS", "ARP", "SEQUENCE", "OTHER"];
    if (!validCategories.includes(presetCategory)) {
      return NextResponse.json({ error: "Invalid preset category" }, { status: 400 });
    }

    const parsedCreditPrice = creditPrice ? parseInt(creditPrice) : 1;
    const maxCreditPrice = dbUser.isWhitelisted ? 50 : 5;
    if (parsedCreditPrice > maxCreditPrice) {
      return NextResponse.json(
        { error: `Credit price cannot exceed ${maxCreditPrice}` },
        { status: 400 }
      );
    }

    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      nanoid(6);

    const preset = await prisma.preset.create({
      data: {
        creatorId: authUser.id,
        name,
        slug,
        description: description || null,
        synthName,
        presetCategory,
        genre,
        tags: tags
          ? (Array.isArray(tags)
              ? tags
              : tags.split(",").map((t: string) => t.trim().toLowerCase()))
          : [],
        creditPrice: parsedCreditPrice,
        fileUrl,
        previewUrl: previewUrl || null,
        coverImageUrl: coverImageUrl || null,
        fileSizeBytes: fileSizeBytes ? BigInt(fileSizeBytes) : null,
        compatibleVersions: compatibleVersions || [],
        parameterSnapshot: parameterSnapshot || null,
        modulationInfo: modulationInfo || null,
        macroDescriptions: macroDescriptions || null,
        isInitPreset: isInitPreset || false,
        status: initialStatus,
        isActive: true,
      },
    });

    // Increment genre usage count
    const normalizedGenre = genre.toLowerCase().replace(/\s+/g, " ");
    await prisma.genre.upsert({
      where: { normalizedName: normalizedGenre },
      update: { usageCount: { increment: 1 } },
      create: {
        name: genre,
        normalizedName: normalizedGenre,
        isCustom: true,
        usageCount: 1,
      },
    });

    return NextResponse.json({
      preset: {
        ...preset,
        fileSizeBytes: preset.fileSizeBytes?.toString() ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/presets error:", error);
    return NextResponse.json(
      { error: "Failed to create preset" },
      { status: 500 }
    );
  }
}

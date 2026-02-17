import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";

// GET /api/samples — Public, returns published samples with filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const genre = searchParams.get("genre") || "";
    const instrumentType = searchParams.get("instrumentType") || "";
    const sampleType = searchParams.get("sampleType") || "";
    const key = searchParams.get("key") || "";
    const scale = searchParams.get("scale") || "";
    const bpmMin = searchParams.get("bpmMin");
    const bpmMax = searchParams.get("bpmMax");
    const sortBy = searchParams.get("sortBy") || "popular";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.SampleWhereInput = {
      status: "PUBLISHED",
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { tags: { hasSome: [search.toLowerCase()] } },
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

    if (genre && genre !== "all") {
      where.genre = genre;
    }

    if (instrumentType && instrumentType !== "all") {
      where.instrumentType = instrumentType;
    }

    if (sampleType && sampleType !== "all") {
      where.sampleType = sampleType as "LOOP" | "ONE_SHOT";
    }

    // Handle key and scale filtering
    // Key format in DB: "C Major", "A Minor", etc.
    if (key && key !== "all" && scale && scale !== "all") {
      // Both key and scale specified: exact match
      where.key = `${key} ${scale}`;
    } else if (key && key !== "all") {
      // Only key (note) specified: match keys starting with that note
      where.key = { startsWith: key };
    } else if (scale && scale !== "all") {
      // Only scale specified: match keys ending with Major/Minor
      where.key = { endsWith: scale };
    }

    if (bpmMin || bpmMax) {
      where.bpm = {};
      if (bpmMin) where.bpm.gte = parseInt(bpmMin);
      if (bpmMax) where.bpm.lte = parseInt(bpmMax);
    }

    let orderBy: Prisma.SampleOrderByWithRelationInput;
    switch (sortBy) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "rating":
        orderBy = { ratingAvg: "desc" };
        break;
      case "popular":
      default:
        orderBy = { downloadCount: "desc" };
        break;
    }

    const [samples, total] = await Promise.all([
      prisma.sample.findMany({
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
      prisma.sample.count({ where }),
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

    return NextResponse.json({ samples: mapped, total, limit, offset });
  } catch (error) {
    console.error("GET /api/samples error:", error);
    return NextResponse.json(
      { error: "Failed to fetch samples" },
      { status: 500 }
    );
  }
}

// POST /api/samples — Auth required, CREATOR role
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
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Only creators can upload samples" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      genre,
      instrumentType,
      sampleType,
      key,
      bpm,
      creditPrice,
      tags,
      fileUrl,
      previewUrl,
      coverImageUrl,
    } = body;

    if (!name || !genre || !instrumentType || !sampleType || !fileUrl) {
      return NextResponse.json(
        { error: "Missing required fields: name, genre, instrumentType, sampleType, fileUrl" },
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

    const sample = await prisma.sample.create({
      data: {
        creatorId: authUser.id,
        name,
        slug,
        genre,
        instrumentType,
        sampleType: sampleType as "LOOP" | "ONE_SHOT",
        key: key || null,
        bpm: bpm ? parseInt(bpm) : null,
        creditPrice: creditPrice ? parseInt(creditPrice) : 1,
        tags: tags
          ? (Array.isArray(tags)
              ? tags
              : tags.split(",").map((t: string) => t.trim().toLowerCase()))
          : [],
        fileUrl,
        previewUrl: previewUrl || null,
        coverImageUrl: coverImageUrl || null,
        status: "PUBLISHED",
        isActive: true,
      },
    });

    return NextResponse.json({ sample }, { status: 201 });
  } catch (error) {
    console.error("POST /api/samples error:", error);
    return NextResponse.json(
      { error: "Failed to create sample" },
      { status: 500 }
    );
  }
}

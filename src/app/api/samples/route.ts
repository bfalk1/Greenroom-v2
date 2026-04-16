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
      where.sampleType = sampleType.toUpperCase() as "LOOP" | "ONE_SHOT";
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

    // Parse sort direction from sortBy (e.g., "name_asc" or just "name")
    const sortDirection = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    // Random sorting flag
    const useRandomSort = sortBy === "random" || !sortBy;
    // Client-provided seed for consistent random pagination (0-1 float)
    const randomSeed = parseFloat(searchParams.get("seed") || "0") || Math.random();

    let orderBy: Prisma.SampleOrderByWithRelationInput | undefined;
    if (!useRandomSort) {
      switch (sortBy) {
        case "name":
          orderBy = { name: sortDirection };
          break;
        case "genre":
          orderBy = { genre: sortDirection };
          break;
        case "artist":
          orderBy = { creator: { artistName: sortDirection } };
          break;
        case "key":
          orderBy = { key: sortDirection };
          break;
        case "bpm":
          orderBy = { bpm: sortDirection };
          break;
        case "price":
          orderBy = { creditPrice: sortDirection };
          break;
        case "rating":
          orderBy = { ratingAvg: sortDirection };
          break;
        case "newest":
        case "recent":
          orderBy = { createdAt: "desc" };
          break;
        case "popular":
          orderBy = { downloadCount: "desc" };
          break;
      }
    }

    let samples;
    let total: number;

    if (useRandomSort) {
      // True random using PostgreSQL setseed() + ORDER BY random().
      // The seed (0-1 float from the client) keeps the random order stable
      // for pagination within the same session/page load.
      total = await prisma.sample.count({ where });

      // Clamp seed to valid PostgreSQL range (-1 to 1)
      const pgSeed = Math.max(-1, Math.min(1, randomSeed * 2 - 1));

      // Build WHERE clause conditions for raw SQL
      // $1=limit, $2=offset, then filter params start at $3
      const conditions: string[] = ["s.status = 'PUBLISHED'", "s.is_active = true"];
      const filterParams: unknown[] = [];
      let paramIndex = 3;

      if (search) {
        conditions.push(`(
          s.name ILIKE $${paramIndex} OR
          $${paramIndex + 1} = ANY(s.tags) OR
          u.artist_name ILIKE $${paramIndex} OR
          u.username ILIKE $${paramIndex}
        )`);
        filterParams.push(`%${search}%`, search.toLowerCase());
        paramIndex += 2;
      }
      if (genre && genre !== "all") {
        conditions.push(`s.genre = $${paramIndex}`);
        filterParams.push(genre);
        paramIndex++;
      }
      if (instrumentType && instrumentType !== "all") {
        conditions.push(`s.instrument_type = $${paramIndex}`);
        filterParams.push(instrumentType);
        paramIndex++;
      }
      if (sampleType && sampleType !== "all") {
        conditions.push(`s.sample_type = $${paramIndex}`);
        filterParams.push(sampleType.toUpperCase());
        paramIndex++;
      }
      if (key && key !== "all" && scale && scale !== "all") {
        conditions.push(`s.key = $${paramIndex}`);
        filterParams.push(`${key} ${scale}`);
        paramIndex++;
      } else if (key && key !== "all") {
        conditions.push(`s.key LIKE $${paramIndex}`);
        filterParams.push(`${key}%`);
        paramIndex++;
      } else if (scale && scale !== "all") {
        conditions.push(`s.key LIKE $${paramIndex}`);
        filterParams.push(`%${scale}`);
        paramIndex++;
      }
      if (bpmMin) {
        conditions.push(`s.bpm >= $${paramIndex}`);
        filterParams.push(parseInt(bpmMin));
        paramIndex++;
      }
      if (bpmMax) {
        conditions.push(`s.bpm <= $${paramIndex}`);
        filterParams.push(parseInt(bpmMax));
        paramIndex++;
      }

      const whereClause = conditions.join(" AND ");

      // Use a transaction so setseed + query share the same connection
      const rawSamples = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe<unknown[]>(`SELECT setseed($1)::text`, pgSeed);
        return tx.$queryRawUnsafe<Array<{
          id: string;
          name: string;
          slug: string;
          creator_id: string;
          genre: string;
          instrument_type: string;
          sample_type: string;
          key: string | null;
          bpm: number | null;
          credit_price: number;
          tags: string[];
          file_url: string;
          preview_url: string | null;
          cover_image_url: string | null;
          waveform_data: unknown;
          rating_avg: number;
          rating_count: number;
          download_count: number;
          created_at: Date;
          artist_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }>>(
          `SELECT s.id, s.name, s.slug, s.creator_id, s.genre, s.instrument_type,
                  s.sample_type, s.key, s.bpm, s.credit_price, s.tags, s.file_url,
                  s.preview_url, s.cover_image_url, s.waveform_data, s.rating_avg,
                  s.rating_count, s.download_count, s.created_at,
                  u.artist_name, u.username, u.avatar_url
           FROM samples s
           JOIN users u ON u.id = s.creator_id
           WHERE ${whereClause}
           ORDER BY random()
           LIMIT $1 OFFSET $2`,
          limit, offset, ...filterParams
        );
      });

      samples = rawSamples.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        creatorId: s.creator_id,
        genre: s.genre,
        instrumentType: s.instrument_type,
        sampleType: s.sample_type,
        key: s.key,
        bpm: s.bpm,
        creditPrice: s.credit_price,
        tags: s.tags,
        fileUrl: s.file_url,
        previewUrl: s.preview_url,
        coverImageUrl: s.cover_image_url,
        waveformData: s.waveform_data,
        ratingAvg: s.rating_avg,
        ratingCount: s.rating_count,
        downloadCount: s.download_count,
        createdAt: s.created_at,
        creator: {
          id: s.creator_id,
          artistName: s.artist_name,
          username: s.username,
          avatarUrl: s.avatar_url,
        },
      }));
    } else {
      const [rawSamples, count] = await Promise.all([
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

      total = count;
      samples = rawSamples;
    }

    // Batch generate signed preview URLs (single request to Supabase)
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Collect valid preview paths
    const previewPaths = samples
      .map(s => s.previewUrl?.startsWith("previews/") ? s.previewUrl.replace("previews/", "") : null);
    
    const validPaths = previewPaths.filter((p): p is string => p !== null);
    
    // Batch request for all signed URLs at once
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

    // Map paths back to URLs
    const previewUrls = previewPaths.map(path => 
      path ? signedUrlMap[path] || null : null
    );

    // Map to frontend format
    const mapped = samples.map((s, i) => ({
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
      preview_url: previewUrls[i],
      cover_art_url: s.coverImageUrl,
      waveform_data: s.waveformData as number[] | null,
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
      select: { id: true, role: true, isWhitelisted: true },
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Only creators can upload samples" },
        { status: 403 }
      );
    }

    // Whitelisted creators get auto-published, others go to review
    const initialStatus = dbUser.isWhitelisted ? "PUBLISHED" : "REVIEW";

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
      waveformData,
    } = body;

    if (!name || !genre || !instrumentType || !sampleType || !fileUrl) {
      return NextResponse.json(
        { error: "Missing required fields: name, genre, instrumentType, sampleType, fileUrl" },
        { status: 400 }
      );
    }

    // Enforce credit price limit: max 5 for non-whitelisted creators
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
        creditPrice: parsedCreditPrice,
        tags: tags
          ? (Array.isArray(tags)
              ? tags
              : tags.split(",").map((t: string) => t.trim().toLowerCase()))
          : [],
        fileUrl,
        previewUrl: previewUrl || null,
        coverImageUrl: coverImageUrl || null,
        waveformData: waveformData || null,
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

    // Trigger preview generation (fire and forget)
    const workerUrl = process.env.PREVIEW_WORKER_URL;
    if (workerUrl) {
      fetch(`${workerUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PREVIEW_WORKER_SECRET || ""}`,
        },
        body: JSON.stringify({ sampleId: sample.id }),
      }).catch((err) => {
        console.error("Failed to trigger preview generation:", err);
      });
    }

    return NextResponse.json({ sample }, { status: 201 });
  } catch (error) {
    console.error("POST /api/samples error:", error);
    return NextResponse.json(
      { error: "Failed to create sample" },
      { status: 500 }
    );
  }
}
// Deploy trigger Mon Mar  9 20:18:25 UTC 2026

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

    // Parse sort direction from sortBy (e.g., "name_asc" or just "name")
    const sortDirection = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    
    // Random sorting flag
    const useRandomSort = sortBy === "random" || !sortBy;
    
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

    // Helper: shuffle array with seeded randomness for consistency
    const seededShuffle = <T extends { id: string }>(arr: T[], seed: number): T[] => {
      const seededRandom = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };
      return [...arr].sort((a, b) => {
        const seedA = seed + a.id.charCodeAt(0) + a.id.charCodeAt(a.id.length - 1);
        const seedB = seed + b.id.charCodeAt(0) + b.id.charCodeAt(b.id.length - 1);
        return seededRandom(seedA) - seededRandom(seedB);
      });
    };

    // Helper: shuffle items with tied values (for rating/popular sorts)
    const shuffleTiedGroups = <T extends { id: string }>(
      arr: T[],
      getValue: (item: T) => number | null,
      seed: number
    ): T[] => {
      if (arr.length <= 1) return arr;
      
      // Group items by their sort value
      const groups: Map<number | null, T[]> = new Map();
      for (const item of arr) {
        const val = getValue(item);
        if (!groups.has(val)) groups.set(val, []);
        groups.get(val)!.push(item);
      }
      
      // Shuffle within each group, then flatten in original value order
      const result: T[] = [];
      const sortedKeys = [...groups.keys()].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return b - a; // desc order
      });
      
      for (const key of sortedKeys) {
        const group = groups.get(key)!;
        if (group.length > 1) {
          result.push(...seededShuffle(group, seed));
        } else {
          result.push(...group);
        }
      }
      
      return result;
    };

    // For random sorting, we use a different approach
    let samples;
    let total: number;
    
    if (useRandomSort) {
      // Get total count
      total = await prisma.sample.count({ where });
      
      // For random: fetch using raw SQL with RANDOM() for true randomization
      // Use a seed based on the current hour to provide some consistency for pagination
      const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60));
      
      // Fetch with random ordering - we use Prisma but shuffle the results
      // For better randomization, we fetch a larger pool and shuffle
      const poolSize = Math.min(total, Math.max(limit * 3, 100));
      const rawSamples = await prisma.sample.findMany({
        where,
        take: poolSize,
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
      
      // Seeded shuffle for consistent pagination within the hour
      const seededRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      
      const shuffled = [...rawSamples].sort((a, b) => {
        const seedA = hourSeed + a.id.charCodeAt(0) + a.id.charCodeAt(a.id.length - 1);
        const seedB = hourSeed + b.id.charCodeAt(0) + b.id.charCodeAt(b.id.length - 1);
        return seededRandom(seedA) - seededRandom(seedB);
      });
      
      samples = shuffled.slice(offset, offset + limit);
    } else {
      // For rating/popular sorts, we need to fetch extra to shuffle tied items properly
      const needsTiebreaker = sortBy === "rating" || sortBy === "popular";
      const fetchLimit = needsTiebreaker ? Math.min(limit * 3, 150) : limit;
      const fetchOffset = needsTiebreaker ? 0 : offset;
      
      const [rawSamples, count] = await Promise.all([
        prisma.sample.findMany({
          where,
          orderBy,
          skip: fetchOffset,
          take: needsTiebreaker ? fetchLimit : limit,
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
      
      if (needsTiebreaker && rawSamples.length > 0) {
        // Shuffle tied values, then slice for pagination
        const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60));
        const getValue = sortBy === "rating" 
          ? (s: typeof rawSamples[0]) => s.ratingAvg 
          : (s: typeof rawSamples[0]) => s.downloadCount;
        const shuffled = shuffleTiedGroups(rawSamples, getValue, hourSeed);
        samples = shuffled.slice(offset, offset + limit);
      } else {
        samples = rawSamples;
      }
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

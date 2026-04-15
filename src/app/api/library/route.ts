import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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
    const offset = parseInt(searchParams.get("offset") || "0");
    const search = searchParams.get("search") || "";

    const where: any = { userId: authUser.id, sampleId: { not: null } };

    if (search) {
      where.sample = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { creator: { artistName: { contains: search, mode: "insensitive" } } },
          { genre: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          sample: {
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

    // Generate signed URLs for previews (needed for waveform generation)
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const previewPaths = purchases.map(p =>
      p.sample!.previewUrl?.startsWith("previews/")
        ? p.sample!.previewUrl!.replace("previews/", "")
        : null
    );
    
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

    const samples = purchases.map((p, i) => {
      const s = p.sample!;
      // Generate standardized filename: ArtistName - SampleName_Key_BPM.wav
      const artistName = (s.creator.artistName || s.creator.username || "Unknown")
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim();
      const sampleName = s.name
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const keyPart = s.key ? `_${s.key.replace(/\s+/g, "")}` : "";
      const bpmPart = s.bpm ? `_${s.bpm}bpm` : "";
      const filename = `${artistName} - ${sampleName}${keyPart}${bpmPart}.wav`;

      // Directory path for organized downloads
      const downloadPath = `${artistName}/${sampleName}${keyPart}${bpmPart}.wav`;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        creator_id: s.creatorId,
        artist_name: s.creator.artistName || s.creator.username,
        genre: s.genre,
        instrument_type: s.instrumentType,
        sample_type: s.sampleType,
        key: s.key,
        bpm: s.bpm,
        credit_price: s.creditPrice,
        tags: s.tags,
        file_url: s.fileUrl,
        signed_url: null, // Generated on-demand via /api/downloads
        filename,
        download_path: downloadPath,
        preview_url: previewUrls[i] || s.previewUrl,
        waveform_data: s.waveformData,
        cover_image_url: s.coverImageUrl || s.creator.avatarUrl,
        average_rating: s.ratingAvg,
        total_ratings: s.ratingCount,
        total_purchases: s.downloadCount,
        purchased_at: p.createdAt,
      };
    });

    return NextResponse.json({ samples, total, limit, offset });
  } catch (error) {
    console.error("Error fetching library:", error);
    return NextResponse.json(
      { error: "Failed to fetch library" },
      { status: 500 }
    );
  }
}

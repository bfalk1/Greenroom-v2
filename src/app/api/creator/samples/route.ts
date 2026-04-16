import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/creator/samples — Auth required, CREATOR role
export async function GET(_request: NextRequest) {
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
      select: { role: true, customPayoutRate: true, avatarUrl: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // Get platform settings for payout rate calculation
    const settings = await prisma.platformSetting.findUnique({
      where: { id: "default" },
      select: { creatorPayoutRate: true, creditValueCents: true },
    });

    const payoutRate = dbUser.customPayoutRate ?? settings?.creatorPayoutRate ?? 70;
    const creditValueCents = settings?.creditValueCents ?? 10;

    const samples = await prisma.sample.findMany({
      where: { creatorId: authUser.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            purchases: true,
            downloads: true,
            ratings: true,
          },
        },
        purchases: {
          select: {
            creditsSpent: true,
          },
        },
      },
    });

    // Sign preview URLs so the Waveform component can fetch audio
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract a storage path from either a raw path ("previews/x.mp3") or a
    // full Supabase URL ("https://.../storage/v1/object/public/previews/x.mp3").
    const extractStoragePath = (url: string | null | undefined, bucket: string): string | null => {
      if (!url) return null;
      if (url.startsWith(`${bucket}/`)) return url.slice(bucket.length + 1);
      const marker = `/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) return url.slice(idx + marker.length);
      return null;
    };

    const previewPaths = samples.map(s => extractStoragePath(s.previewUrl, "previews"));
    const validPreviewPaths = previewPaths.filter((p): p is string => p !== null);

    let signedPreviewMap: Record<string, string> = {};
    if (validPreviewPaths.length > 0) {
      const { data } = await serviceClient.storage
        .from("previews")
        .createSignedUrls(validPreviewPaths, 3600);
      if (data) {
        for (const item of data) {
          if (item.signedUrl && item.path) {
            signedPreviewMap[item.path] = item.signedUrl;
          }
        }
      }
    }

    const coverPaths = samples.map(s => extractStoragePath(s.coverImageUrl, "covers"));
    const validCoverPaths = coverPaths.filter((p): p is string => p !== null);

    let signedCoverMap: Record<string, string> = {};
    if (validCoverPaths.length > 0) {
      const { data } = await serviceClient.storage
        .from("covers")
        .createSignedUrls(validCoverPaths, 3600);
      if (data) {
        for (const item of data) {
          if (item.signedUrl && item.path) {
            signedCoverMap[item.path] = item.signedUrl;
          }
        }
      }
    }

    const mapped = samples.map((s, i) => {
      // Calculate total credits spent on this sample
      const totalCredits = s.purchases.reduce((sum, p) => sum + p.creditsSpent, 0);
      // Calculate earnings: credits * credit value * payout rate
      const earningsUsd = (totalCredits * creditValueCents * payoutRate) / 10000;

      const previewPath = previewPaths[i];
      const signedPreviewUrl = previewPath ? signedPreviewMap[previewPath] || null : null;

      const coverPath = coverPaths[i];
      const signedCoverUrl = coverPath ? signedCoverMap[coverPath] || null : s.coverImageUrl;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        genre: s.genre,
        instrumentType: s.instrumentType,
        sampleType: s.sampleType,
        key: s.key,
        bpm: s.bpm,
        creditPrice: s.creditPrice,
        tags: s.tags,
        coverImageUrl: signedCoverUrl,
        creatorAvatarUrl: dbUser.avatarUrl,
        previewUrl: signedPreviewUrl,
        waveformData: s.waveformData,
        status: s.status,
        downloadCount: s.downloadCount,
        ratingAvg: s.ratingAvg,
        ratingCount: s.ratingCount,
        purchases: s._count.purchases,
        downloads: s._count.downloads,
        totalCredits,
        earningsUsd,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ samples: mapped, payoutRate });
  } catch (error) {
    console.error("GET /api/creator/samples error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator samples" },
      { status: 500 }
    );
  }
}

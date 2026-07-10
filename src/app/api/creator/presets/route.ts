import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  computePayoutCents,
  resolveCentsPerCredit,
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
} from "@/lib/payoutMath";

// GET /api/creator/presets — Auth required, CREATOR role
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

    const settings = await prisma.platformSetting.findUnique({
      where: { id: "default" },
      select: { creatorPayoutRate: true },
    });

    const centsPerCredit = resolveCentsPerCredit(
      dbUser.customPayoutRate,
      settings?.creatorPayoutRate ?? DEFAULT_PAYOUT_CENTS_PER_CREDIT
    );

    const presets = await prisma.preset.findMany({
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

    // Sign preview + cover URLs so the dashboard row can play audio and show art.
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract a storage path from either a raw path ("previews/x.mp3") or a
    // full Supabase URL ("https://.../object/public/previews/x.mp3").
    const extractStoragePath = (url: string | null | undefined, bucket: string): string | null => {
      if (!url) return null;
      if (url.startsWith(`${bucket}/`)) return url.slice(bucket.length + 1);
      const marker = `/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) return url.slice(idx + marker.length);
      return null;
    };

    const signPaths = async (bucket: string, paths: (string | null)[]) => {
      const valid = paths.filter((p): p is string => p !== null);
      const map: Record<string, string> = {};
      if (valid.length > 0) {
        const { data } = await serviceClient.storage.from(bucket).createSignedUrls(valid, 3600);
        if (data) {
          for (const item of data) {
            if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
          }
        }
      }
      return map;
    };

    const previewPaths = presets.map((p) => extractStoragePath(p.previewUrl, "previews"));
    const coverPaths = presets.map((p) => extractStoragePath(p.coverImageUrl, "covers"));
    const signedPreviewMap = await signPaths("previews", previewPaths);
    const signedCoverMap = await signPaths("covers", coverPaths);

    const mapped = presets.map((p, i) => {
      const totalCredits = p.purchases.reduce((sum, pur) => sum + pur.creditsSpent, 0);
      const earningsUsd = computePayoutCents(totalCredits, centsPerCredit) / 100;

      const previewPath = previewPaths[i];
      const signedPreviewUrl = previewPath ? signedPreviewMap[previewPath] || null : null;
      const coverPath = coverPaths[i];
      const signedCoverUrl = coverPath ? signedCoverMap[coverPath] || null : p.coverImageUrl;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        synthName: p.synthName,
        presetCategory: p.presetCategory,
        genre: p.genre,
        tags: p.tags,
        creditPrice: p.creditPrice,
        coverImageUrl: signedCoverUrl,
        creatorAvatarUrl: dbUser.avatarUrl,
        previewUrl: signedPreviewUrl,
        status: p.status,
        downloadCount: p.downloadCount,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        purchases: p._count.purchases,
        downloads: p._count.downloads,
        totalCredits,
        earningsUsd,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ presets: mapped, centsPerCredit });
  } catch (error) {
    console.error("GET /api/creator/presets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator presets" },
      { status: 500 }
    );
  }
}

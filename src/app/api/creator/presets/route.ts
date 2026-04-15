import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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
      select: { role: true, customPayoutRate: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    const settings = await prisma.platformSetting.findUnique({
      where: { id: "default" },
      select: { creatorPayoutRate: true, creditValueCents: true },
    });

    const payoutRate = dbUser.customPayoutRate ?? settings?.creatorPayoutRate ?? 70;
    const creditValueCents = settings?.creditValueCents ?? 10;

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

    const mapped = presets.map((p) => {
      const totalCredits = p.purchases.reduce((sum, pur) => sum + pur.creditsSpent, 0);
      const earningsUsd = (totalCredits * creditValueCents * payoutRate) / 10000;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        synthName: p.synthName,
        presetCategory: p.presetCategory,
        genre: p.genre,
        tags: p.tags,
        creditPrice: p.creditPrice,
        coverImageUrl: p.coverImageUrl,
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

    return NextResponse.json({ presets: mapped, payoutRate });
  } catch (error) {
    console.error("GET /api/creator/presets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator presets" },
      { status: 500 }
    );
  }
}

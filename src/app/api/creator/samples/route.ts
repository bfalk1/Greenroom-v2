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
      select: { role: true, customPayoutRate: true },
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

    const mapped = samples.map((s) => {
      // Calculate total credits spent on this sample
      const totalCredits = s.purchases.reduce((sum, p) => sum + p.creditsSpent, 0);
      // Calculate earnings: credits * credit value * payout rate
      const earningsUsd = (totalCredits * creditValueCents * payoutRate) / 10000;

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
        coverImageUrl: s.coverImageUrl,
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

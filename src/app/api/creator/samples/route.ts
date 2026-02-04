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
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

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
      },
    });

    const mapped = samples.map((s) => ({
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
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json({ samples: mapped });
  } catch (error) {
    console.error("GET /api/creator/samples error:", error);
    return NextResponse.json(
      { error: "Failed to fetch creator samples" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/ratings — Get user's ratings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ratings = await prisma.rating.findMany({
      where: { userId: authUser.id },
      select: {
        sampleId: true,
        score: true,
      },
    });

    // Return as a map for easy lookup
    const ratingsMap: Record<string, number> = {};
    ratings.forEach((r) => {
      ratingsMap[r.sampleId] = r.score;
    });

    return NextResponse.json({ ratings: ratingsMap });
  } catch (error) {
    console.error("GET /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ratings" },
      { status: 500 }
    );
  }
}

// POST /api/ratings — Submit or update a rating
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sampleId, score } = body;

    if (!sampleId) {
      return NextResponse.json(
        { error: "sampleId is required" },
        { status: 400 }
      );
    }

    if (!score || score < 1 || score > 5) {
      return NextResponse.json(
        { error: "score must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Check sample exists
    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
    });

    if (!sample || sample.status !== "PUBLISHED" || !sample.isActive) {
      return NextResponse.json(
        { error: "Sample not found" },
        { status: 404 }
      );
    }

    // Check if user has purchased this sample
    const purchase = await prisma.purchase.findUnique({
      where: {
        userId_sampleId: {
          userId: authUser.id,
          sampleId,
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "You must purchase a sample before rating it" },
        { status: 403 }
      );
    }

    // Upsert rating
    const rating = await prisma.rating.upsert({
      where: {
        userId_sampleId: {
          userId: authUser.id,
          sampleId,
        },
      },
      update: {
        score,
      },
      create: {
        userId: authUser.id,
        sampleId,
        score,
      },
    });

    // Recalculate average rating for the sample
    const stats = await prisma.rating.aggregate({
      where: { sampleId },
      _avg: { score: true },
      _count: { score: true },
    });

    await prisma.sample.update({
      where: { id: sampleId },
      data: {
        ratingAvg: stats._avg.score || 0,
        ratingCount: stats._count.score || 0,
      },
    });

    return NextResponse.json({
      rating: {
        sampleId: rating.sampleId,
        score: rating.score,
      },
      sampleStats: {
        average: stats._avg.score || 0,
        count: stats._count.score || 0,
      },
    });
  } catch (error) {
    console.error("POST /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to submit rating" },
      { status: 500 }
    );
  }
}

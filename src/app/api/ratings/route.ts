import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/ratings — Get user's ratings for both samples and presets
export async function GET(_request: NextRequest) {
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
        presetId: true,
        score: true,
      },
    });

    // Return as maps for easy lookup
    const sampleRatings: Record<string, number> = {};
    const presetRatings: Record<string, number> = {};
    ratings.forEach((r) => {
      if (r.sampleId) sampleRatings[r.sampleId] = r.score;
      if (r.presetId) presetRatings[r.presetId] = r.score;
    });

    return NextResponse.json({
      ratings: sampleRatings,
      presetRatings,
    });
  } catch (error) {
    console.error("GET /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ratings" },
      { status: 500 }
    );
  }
}

// POST /api/ratings — Submit or update a rating for sample or preset
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sampleId, presetId, score } = body;

    if (!sampleId && !presetId) {
      return NextResponse.json(
        { error: "sampleId or presetId is required" },
        { status: 400 }
      );
    }

    if (!score || score < 1 || score > 5) {
      return NextResponse.json(
        { error: "score must be between 1 and 5" },
        { status: 400 }
      );
    }

    if (sampleId) {
      // Sample rating
      const sample = await prisma.sample.findUnique({
        where: { id: sampleId },
      });

      if (!sample || sample.status !== "PUBLISHED" || !sample.isActive) {
        return NextResponse.json({ error: "Sample not found" }, { status: 404 });
      }

      const purchase = await prisma.purchase.findUnique({
        where: { userId_sampleId: { userId: authUser.id, sampleId } },
      });

      if (!purchase) {
        return NextResponse.json(
          { error: "You must purchase a sample before rating it" },
          { status: 403 }
        );
      }

      const rating = await prisma.rating.upsert({
        where: { userId_sampleId: { userId: authUser.id, sampleId } },
        update: { score },
        create: { userId: authUser.id, sampleId, score },
      });

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
        rating: { sampleId: rating.sampleId, score: rating.score },
        sampleStats: {
          average: stats._avg.score || 0,
          count: stats._count.score || 0,
        },
      });
    } else {
      // Preset rating
      const preset = await prisma.preset.findUnique({
        where: { id: presetId },
      });

      if (!preset || preset.status !== "PUBLISHED" || !preset.isActive) {
        return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      }

      const purchase = await prisma.purchase.findFirst({
        where: { userId: authUser.id, presetId },
      });

      if (!purchase) {
        return NextResponse.json(
          { error: "You must purchase a preset before rating it" },
          { status: 403 }
        );
      }

      // Upsert rating for preset
      const existingRating = await prisma.rating.findFirst({
        where: { userId: authUser.id, presetId },
      });

      let rating;
      if (existingRating) {
        rating = await prisma.rating.update({
          where: { id: existingRating.id },
          data: { score },
        });
      } else {
        rating = await prisma.rating.create({
          data: { userId: authUser.id, presetId, score },
        });
      }

      const stats = await prisma.rating.aggregate({
        where: { presetId },
        _avg: { score: true },
        _count: { score: true },
      });

      await prisma.preset.update({
        where: { id: presetId },
        data: {
          ratingAvg: stats._avg.score || 0,
          ratingCount: stats._count.score || 0,
        },
      });

      return NextResponse.json({
        rating: { presetId: rating.presetId, score: rating.score },
        presetStats: {
          average: stats._avg.score || 0,
          count: stats._count.score || 0,
        },
      });
    }
  } catch (error) {
    console.error("POST /api/ratings error:", error);
    return NextResponse.json(
      { error: "Failed to submit rating" },
      { status: 500 }
    );
  }
}

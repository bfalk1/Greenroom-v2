import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/samples/following/artists — Get followed artists with their new sample counts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ artists: [], following: 0 });
    }

    // Get IDs of creators the user follows
    const follows = await prisma.follow.findMany({
      where: { followerId: authUser.id },
      select: { creatorId: true },
    });

    if (follows.length === 0) {
      return NextResponse.json({ artists: [], following: 0 });
    }

    const creatorIds = follows.map((f) => f.creatorId);

    // Get creators with their sample counts (samples from last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const creators = await prisma.user.findMany({
      where: {
        id: { in: creatorIds },
        role: "CREATOR",
      },
      select: {
        id: true,
        artistName: true,
        username: true,
        avatarUrl: true,
        _count: {
          select: {
            samples: {
              where: {
                status: "PUBLISHED",
                isActive: true,
                createdAt: { gte: thirtyDaysAgo },
              },
            },
          },
        },
      },
    });

    // Also get total sample counts for each creator
    const totalCounts = await prisma.sample.groupBy({
      by: ["creatorId"],
      where: {
        creatorId: { in: creatorIds },
        status: "PUBLISHED",
        isActive: true,
      },
      _count: true,
    });

    const totalCountMap = new Map(totalCounts.map(c => [c.creatorId, c._count]));

    // Map to frontend format, sorted by new sample count (most active first)
    const mapped = creators
      .map((c) => ({
        id: c.id,
        artist_name: c.artistName || c.username || "Unknown",
        avatar_url: c.avatarUrl,
        new_samples: c._count.samples,
        total_samples: totalCountMap.get(c.id) || 0,
      }))
      .filter(a => a.new_samples > 0 || a.total_samples > 0) // Only show artists with samples
      .sort((a, b) => b.new_samples - a.new_samples); // Most active first

    return NextResponse.json({
      artists: mapped,
      following: follows.length,
    });
  } catch (error) {
    console.error("GET /api/samples/following/artists error:", error);
    return NextResponse.json(
      { error: "Failed to fetch artists" },
      { status: 500 }
    );
  }
}

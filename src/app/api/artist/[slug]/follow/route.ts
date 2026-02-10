import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// POST /api/artist/[slug]/follow — Toggle follow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;

    // Find the artist
    const artist = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: slug, mode: "insensitive" } },
          { artistName: { equals: slug, mode: "insensitive" } },
          { artistName: { equals: slug.replace(/-/g, " "), mode: "insensitive" } },
        ],
        role: { in: ["CREATOR", "ADMIN"] },
        isActive: true,
      },
    });

    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    // Can't follow yourself
    if (artist.id === authUser.id) {
      return NextResponse.json(
        { error: "Cannot follow yourself" },
        { status: 400 }
      );
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_creatorId: {
          followerId: authUser.id,
          creatorId: artist.id,
        },
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: { id: existingFollow.id },
      });

      const followerCount = await prisma.follow.count({
        where: { creatorId: artist.id },
      });

      return NextResponse.json({
        following: false,
        follower_count: followerCount,
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          followerId: authUser.id,
          creatorId: artist.id,
        },
      });

      const followerCount = await prisma.follow.count({
        where: { creatorId: artist.id },
      });

      return NextResponse.json({
        following: true,
        follower_count: followerCount,
      });
    }
  } catch (error) {
    console.error("POST /api/artist/[slug]/follow error:", error);
    return NextResponse.json(
      { error: "Failed to update follow status" },
      { status: 500 }
    );
  }
}

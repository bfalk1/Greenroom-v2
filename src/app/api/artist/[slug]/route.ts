import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/artist/[slug] — Public artist profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    // Find artist by username or artistName (slug-ified)
    const artist = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: slug, mode: "insensitive" } },
          { artistName: { equals: slug, mode: "insensitive" } },
          // Also try with spaces replaced by dashes
          { artistName: { equals: slug.replace(/-/g, " "), mode: "insensitive" } },
        ],
        role: { in: ["CREATOR", "ADMIN"] },
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        artistName: true,
        bio: true,
        avatarUrl: true,
        bannerUrl: true,
        socialLinks: true,
        createdAt: true,
        _count: {
          select: {
            samples: {
              where: { status: "PUBLISHED", isActive: true },
            },
            followers: true,
          },
        },
      },
    });

    if (!artist) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

    // Get total downloads across all samples
    const downloadStats = await prisma.sample.aggregate({
      where: {
        creatorId: artist.id,
        status: "PUBLISHED",
        isActive: true,
      },
      _sum: {
        downloadCount: true,
      },
    });

    // Check if current user follows this artist
    let isFollowing = false;
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (authUser) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_creatorId: {
            followerId: authUser.id,
            creatorId: artist.id,
          },
        },
      });
      isFollowing = !!follow;
    }

    // Pagination params
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // Get artist's published samples with pagination
    const samples = await prisma.sample.findMany({
      where: {
        creatorId: artist.id,
        status: "PUBLISHED",
        isActive: true,
      },
      orderBy: { downloadCount: "desc" },
      skip: offset,
      take: limit + 1, // Fetch one extra to check if there's more
      include: {
        creator: {
          select: {
            id: true,
            artistName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    const hasMore = samples.length > limit;
    const paginatedSamples = hasMore ? samples.slice(0, limit) : samples;

    // Map samples to frontend format
    const mappedSamples = paginatedSamples.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      creator_id: s.creatorId,
      artist_name: s.creator.artistName || s.creator.username || "Unknown",
      creator_avatar: s.creator.avatarUrl,
      genre: s.genre,
      instrument_type: s.instrumentType,
      sample_type: s.sampleType,
      key: s.key,
      bpm: s.bpm,
      credit_price: s.creditPrice,
      tags: s.tags,
      file_url: s.previewUrl || s.fileUrl,
      preview_url: s.previewUrl,
      waveform_data: s.waveformData,
      cover_art_url: s.coverImageUrl,
      average_rating: s.ratingAvg,
      total_ratings: s.ratingCount,
      total_purchases: s.downloadCount,
      total_downloads: s.downloadCount,
      created_date: s.createdAt.toISOString(),
    }));

    return NextResponse.json({
      artist: {
        id: artist.id,
        username: artist.username,
        artist_name: artist.artistName || artist.username,
        bio: artist.bio,
        avatar_url: artist.avatarUrl,
        banner_url: artist.bannerUrl,
        social_links: artist.socialLinks,
        created_at: artist.createdAt.toISOString(),
        sample_count: artist._count.samples,
        follower_count: artist._count.followers,
        total_downloads: downloadStats._sum.downloadCount || 0,
        is_following: isFollowing,
      },
      samples: mappedSamples,
      hasMore,
    });
  } catch (error) {
    console.error("GET /api/artist/[slug] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch artist" },
      { status: 500 }
    );
  }
}

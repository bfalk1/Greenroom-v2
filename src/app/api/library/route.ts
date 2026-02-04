import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: { userId: authUser.id },
      include: {
        sample: {
          include: {
            creator: {
              select: {
                artistName: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const samples = purchases.map((p) => ({
      id: p.sample.id,
      name: p.sample.name,
      slug: p.sample.slug,
      creator_id: p.sample.creatorId,
      artist_name: p.sample.creator.artistName || p.sample.creator.username,
      genre: p.sample.genre,
      instrument_type: p.sample.instrumentType,
      sample_type: p.sample.sampleType,
      key: p.sample.key,
      bpm: p.sample.bpm,
      credit_price: p.sample.creditPrice,
      tags: p.sample.tags,
      file_url: p.sample.fileUrl,
      preview_url: p.sample.previewUrl,
      cover_image_url: p.sample.coverImageUrl,
      average_rating: p.sample.ratingAvg,
      total_ratings: p.sample.ratingCount,
      total_purchases: p.sample.downloadCount,
      purchased_at: p.createdAt,
    }));

    return NextResponse.json({ samples });
  } catch (error) {
    console.error("Error fetching library:", error);
    return NextResponse.json(
      { error: "Failed to fetch library" },
      { status: 500 }
    );
  }
}

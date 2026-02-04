import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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

    // Generate signed URLs for all purchased samples
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const samples = await Promise.all(
      purchases.map(async (p) => {
        let signedUrl = null;

        if (p.sample.fileUrl) {
          const parts = p.sample.fileUrl.split("/");
          const bucket = parts[0];
          const path = parts.slice(1).join("/");

          const { data } = await serviceClient.storage
            .from(bucket)
            .createSignedUrl(path, 3600); // 1 hour expiry

          signedUrl = data?.signedUrl || null;
        }

        const filename = p.sample.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") + ".wav";

        return {
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
          signed_url: signedUrl,
          filename,
          preview_url: p.sample.previewUrl,
          cover_image_url: p.sample.coverImageUrl,
          average_rating: p.sample.ratingAvg,
          total_ratings: p.sample.ratingCount,
          total_purchases: p.sample.downloadCount,
          purchased_at: p.createdAt,
        };
      })
    );

    return NextResponse.json({ samples });
  } catch (error) {
    console.error("Error fetching library:", error);
    return NextResponse.json(
      { error: "Failed to fetch library" },
      { status: 500 }
    );
  }
}

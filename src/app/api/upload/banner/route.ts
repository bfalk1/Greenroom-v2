import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { validateRasterImage } from "@/lib/upload";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be smaller than 10MB" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify real raster image by magic bytes; server-derive ext + content-type
    // so a public bucket can't serve attacker-supplied SVG/HTML.
    const image = validateRasterImage(file.name, buffer);
    if (!image.ok) {
      return NextResponse.json({ error: image.error }, { status: 400 });
    }

    // Upload to Supabase storage using admin client
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const filePath = `${authUser.id}/banner-${Date.now()}.${image.ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("banners")
      .upload(filePath, buffer, {
        contentType: image.contentType,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Banner upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload banner" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("banners").getPublicUrl(filePath);

    // Update user profile with banner URL
    await prisma.user.update({
      where: { id: authUser.id },
      data: { bannerUrl: publicUrl },
    });

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("POST /api/upload/banner error:", error);
    return NextResponse.json(
      { error: "Failed to upload banner" },
      { status: 500 }
    );
  }
}

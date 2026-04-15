import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Service role key bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRESET_EXTENSIONS = [".fxp", ".vital", ".phaseplant", ".nmsv", ".aupreset", ".syx", ".zip"];
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".m4a"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated and is a creator
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "CREATOR") {
      return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const presetFile = formData.get("presetFile") as File | null;
    const previewFile = formData.get("previewFile") as File | null;
    const coverFile = formData.get("coverFile") as File | null;

    if (!presetFile) {
      return NextResponse.json({ error: "Preset file is required" }, { status: 400 });
    }

    if (!previewFile) {
      return NextResponse.json({ error: "Audio preview is required" }, { status: 400 });
    }

    // Validate preset file
    const presetExt = "." + presetFile.name.split(".").pop()?.toLowerCase();
    if (!PRESET_EXTENSIONS.includes(presetExt)) {
      return NextResponse.json({ error: `Invalid preset file type. Accepted: ${PRESET_EXTENSIONS.join(", ")}` }, { status: 400 });
    }
    if (presetFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Preset file must be under 10MB" }, { status: 400 });
    }
    if (presetFile.size === 0) {
      return NextResponse.json({ error: "Preset file is empty" }, { status: 400 });
    }

    // Validate audio preview
    const previewExt = "." + previewFile.name.split(".").pop()?.toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(previewExt)) {
      return NextResponse.json({ error: "Audio preview must be WAV, MP3, OGG, or M4A" }, { status: 400 });
    }
    if (previewFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio preview must be under 20MB" }, { status: 400 });
    }

    // Upload preset file to "presets" bucket (private)
    const presetPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${presetExt}`;
    const presetBuffer = Buffer.from(await presetFile.arrayBuffer());

    const { error: presetUploadError } = await supabaseAdmin.storage
      .from("presets")
      .upload(presetPath, presetBuffer, {
        contentType: "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (presetUploadError) {
      console.error("Preset upload error:", presetUploadError);
      return NextResponse.json({ error: "Preset file upload failed" }, { status: 500 });
    }

    // Upload audio preview to "previews" bucket
    const previewPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${previewExt}`;
    const previewBuffer = Buffer.from(await previewFile.arrayBuffer());

    const { error: previewUploadError } = await supabaseAdmin.storage
      .from("previews")
      .upload(previewPath, previewBuffer, {
        contentType: previewFile.type || "audio/wav",
        cacheControl: "3600",
        upsert: false,
      });

    if (previewUploadError) {
      console.error("Preview upload error:", previewUploadError);
      return NextResponse.json({ error: "Audio preview upload failed" }, { status: 500 });
    }

    // Upload cover image if provided
    let coverImageUrl: string | null = null;
    if (coverFile) {
      const coverExt = "." + coverFile.name.split(".").pop()?.toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(coverExt)) {
        return NextResponse.json({ error: "Cover must be JPG, PNG, or WebP" }, { status: 400 });
      }
      if (coverFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be under 5MB" }, { status: 400 });
      }

      const coverPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${coverExt}`;
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());

      const { error: coverUploadError } = await supabaseAdmin.storage
        .from("covers")
        .upload(coverPath, coverBuffer, {
          contentType: coverFile.type || "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        });

      if (coverUploadError) {
        console.error("Cover upload error:", coverUploadError);
        return NextResponse.json({ error: "Cover image upload failed" }, { status: 500 });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from("covers")
        .getPublicUrl(coverPath);
      coverImageUrl = publicUrl;
    }

    return NextResponse.json({
      fileUrl: `presets/${presetPath}`,
      previewUrl: `previews/${previewPath}`,
      coverImageUrl,
      fileSizeBytes: presetFile.size,
    });
  } catch (error) {
    console.error("Preset upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

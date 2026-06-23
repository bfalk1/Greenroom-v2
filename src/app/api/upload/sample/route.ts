import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isWavBuffer, validateRasterImage } from "@/lib/upload";

// Service role key bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


export async function POST(request: NextRequest) {
  try {
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
    const audioFile = formData.get("audioFile") as File | null;
    const coverFile = formData.get("coverFile") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (!audioFile.name.toLowerCase().endsWith(".wav")) {
      return NextResponse.json({ error: "Audio file must be WAV" }, { status: 400 });
    }
    if (audioFile.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }
    if (audioFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file must be under 50MB" }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Verify real WAV by magic bytes (not just the filename), and store with a
    // fixed server-derived extension + content-type so the stored object can't
    // carry attacker-controlled metadata.
    if (!isWavBuffer(audioBuffer)) {
      return NextResponse.json({ error: "Audio file must be a valid WAV" }, { status: 400 });
    }
    const audioPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;

    const { error: audioUploadError } = await supabaseAdmin.storage
      .from("samples")
      .upload(audioPath, audioBuffer, {
        contentType: "audio/wav",
        cacheControl: "3600",
        upsert: false,
      });

    if (audioUploadError) {
      console.error("Audio upload error:", audioUploadError);
      return NextResponse.json({ error: "Audio upload failed" }, { status: 500 });
    }

    let coverImageUrl: string | null = null;
    if (coverFile) {
      if (coverFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be under 5MB" }, { status: 400 });
      }

      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
      const cover = validateRasterImage(coverFile.name, coverBuffer);
      if (!cover.ok) {
        return NextResponse.json({ error: cover.error }, { status: 400 });
      }

      const coverPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${cover.ext}`;

      const { error: coverUploadError } = await supabaseAdmin.storage
        .from("covers")
        .upload(coverPath, coverBuffer, {
          contentType: cover.contentType,
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
      fileUrl: `samples/${audioPath}`,
      coverImageUrl,
    });
  } catch (error) {
    console.error("Sample upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Service role key bypasses RLS. Must be a session-free client so minting runs
// with service-role privileges and needs no bucket write RLS policy.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRESET_EXTENSIONS = [".serumpreset", ".fxp", ".vital", ".phaseplant", ".nmsv", ".aupreset", ".syx", ".zip"];
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function ext(filename: string): string {
  return "." + (filename.split(".").pop()?.toLowerCase() || "");
}

function objectPath(userId: string, extension: string): string {
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
}

// Mint short-lived Supabase signed upload URLs so the browser PUTs the preset,
// its audio preview, and optional cover DIRECTLY to storage. The bytes never
// flow through this function, which is subject to Vercel's fixed 4.5MB
// request-body limit (it 413'd the audio preview / larger presets when posted
// here as multipart). Content is re-validated where it matters (cover magic
// bytes) in POST /api/presets.
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

    const body = (await request.json().catch(() => null)) as {
      preset?: { filename?: string; size?: number };
      preview?: { filename?: string; size?: number };
      cover?: { filename?: string; size?: number } | null;
    } | null;

    const { preset, preview, cover } = body ?? {};

    if (!preset?.filename || !preview?.filename) {
      return NextResponse.json(
        { error: "Preset file and audio preview are required" },
        { status: 400 }
      );
    }

    // Preset file: extension + size (size is client-declared; the hard cap is
    // the Supabase bucket fileSizeLimit).
    const presetExt = ext(preset.filename);
    if (!PRESET_EXTENSIONS.includes(presetExt)) {
      return NextResponse.json(
        { error: `Invalid preset file type. Accepted: ${PRESET_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!preset.size || preset.size <= 0) {
      return NextResponse.json({ error: "Preset file is empty" }, { status: 400 });
    }
    if (preset.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Preset file must be under 10MB" }, { status: 400 });
    }

    // Audio preview: extension + size.
    const previewExt = ext(preview.filename);
    const previewContentType = AUDIO_CONTENT_TYPES[previewExt];
    if (!previewContentType) {
      return NextResponse.json(
        { error: "Audio preview must be WAV, MP3, OGG, or M4A" },
        { status: 400 }
      );
    }
    if (preview.size && preview.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio preview must be under 20MB" }, { status: 400 });
    }

    const presetPath = objectPath(user.id, presetExt);
    const previewPath = objectPath(user.id, previewExt);

    const [presetSigned, previewSigned] = await Promise.all([
      supabaseAdmin.storage.from("presets").createSignedUploadUrl(presetPath),
      supabaseAdmin.storage.from("previews").createSignedUploadUrl(previewPath),
    ]);

    if (presetSigned.error || !presetSigned.data || previewSigned.error || !previewSigned.data) {
      console.error("Preset signed upload URL error:", presetSigned.error || previewSigned.error);
      return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
    }

    const result: {
      preset: { uploadPath: string; token: string; fileUrl: string; contentType: string };
      preview: { uploadPath: string; token: string; previewUrl: string; contentType: string };
      cover?: { uploadPath: string; token: string; contentType: string; publicUrl: string };
    } = {
      preset: {
        uploadPath: presetPath,
        token: presetSigned.data.token,
        fileUrl: `presets/${presetPath}`,
        contentType: "application/octet-stream",
      },
      preview: {
        uploadPath: previewPath,
        token: previewSigned.data.token,
        previewUrl: `previews/${previewPath}`,
        contentType: previewContentType,
      },
    };

    if (cover && cover.filename) {
      const coverExt = ext(cover.filename);
      const coverContentType = IMAGE_CONTENT_TYPES[coverExt];
      if (!coverContentType) {
        return NextResponse.json({ error: "Cover must be JPG, PNG, or WebP" }, { status: 400 });
      }
      if (cover.size && cover.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Cover image must be under 5MB" }, { status: 400 });
      }

      const coverPath = objectPath(user.id, coverExt);
      const coverSigned = await supabaseAdmin.storage
        .from("covers")
        .createSignedUploadUrl(coverPath);
      if (coverSigned.error || !coverSigned.data) {
        console.error("Cover signed upload URL error:", coverSigned.error);
        return NextResponse.json({ error: "Could not start cover upload" }, { status: 500 });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage.from("covers").getPublicUrl(coverPath);
      result.cover = {
        uploadPath: coverPath,
        token: coverSigned.data.token,
        contentType: coverContentType,
        publicUrl,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Preset upload init error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

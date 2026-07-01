import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Service role key bypasses RLS. This MUST be a session-free client (not the
// SSR/cookie client) so minting runs with service-role privileges and needs no
// bucket write RLS policy — see the storage notes.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

// Derive a server-owned storage extension + content-type from a cover filename.
// The extension is checked here; the actual bytes are re-validated by magic
// bytes in POST /api/samples after the direct upload (covers is public).
function coverKind(
  filename: string
): { ext: "jpg" | "png" | "webp"; contentType: string } | null {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return { ext: "jpg", contentType: "image/jpeg" };
  if (ext === "png") return { ext: "png", contentType: "image/png" };
  if (ext === "webp") return { ext: "webp", contentType: "image/webp" };
  return null;
}

function objectPath(userId: string, ext: string): string {
  return `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}

// Mint short-lived Supabase signed upload URLs so the browser PUTs the file
// bytes DIRECTLY to storage. The bytes never flow through this function, which
// is subject to Vercel's fixed 4.5MB request-body limit (it 413'd any real WAV
// when the file was posted here as multipart). The server still gates the
// upload (auth + CREATOR + extension/size) before issuing a token, and
// re-validates the stored object in POST /api/samples.
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
      filename?: string;
      size?: number;
      cover?: { filename?: string; size?: number } | null;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { filename, size, cover } = body;

    // Audio: extension + size are validated here (size is client-declared and
    // re-asserted against the stored object in POST /api/samples).
    if (!filename || !filename.toLowerCase().endsWith(".wav")) {
      return NextResponse.json({ error: "Audio file must be WAV" }, { status: 400 });
    }
    if (!size || size <= 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }
    if (size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio file must be under 50MB" }, { status: 400 });
    }

    const audioPath = objectPath(user.id, "wav");
    const { data: audioSigned, error: audioSignError } = await supabaseAdmin.storage
      .from("samples")
      .createSignedUploadUrl(audioPath);

    if (audioSignError || !audioSigned) {
      console.error("Audio signed upload URL error:", audioSignError);
      return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
    }

    const result: {
      audio: { uploadPath: string; token: string; fileUrl: string };
      cover?: { uploadPath: string; token: string; contentType: string; publicUrl: string };
    } = {
      audio: {
        uploadPath: audioPath, // pass to uploadToSignedUrl (bucket: samples)
        token: audioSigned.token,
        fileUrl: `samples/${audioPath}`, // pass to POST /api/samples
      },
    };

    if (cover && cover.filename) {
      const kind = coverKind(cover.filename);
      if (!kind) {
        return NextResponse.json(
          { error: "Cover image must be a JPG, PNG, or WebP" },
          { status: 400 }
        );
      }
      if (cover.size && cover.size > MAX_COVER_BYTES) {
        return NextResponse.json({ error: "Cover image must be under 5MB" }, { status: 400 });
      }

      const coverPath = objectPath(user.id, kind.ext);
      const { data: coverSigned, error: coverSignError } = await supabaseAdmin.storage
        .from("covers")
        .createSignedUploadUrl(coverPath);

      if (coverSignError || !coverSigned) {
        console.error("Cover signed upload URL error:", coverSignError);
        return NextResponse.json({ error: "Could not start cover upload" }, { status: 500 });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from("covers")
        .getPublicUrl(coverPath);

      result.cover = {
        uploadPath: coverPath, // pass to uploadToSignedUrl (bucket: covers)
        token: coverSigned.token,
        contentType: kind.contentType,
        publicUrl, // pass to POST /api/samples as coverImageUrl
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Sample upload init error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

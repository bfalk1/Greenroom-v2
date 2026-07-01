import { createClient } from "@/lib/supabase/client";

type MintResponse = {
  audio: { uploadPath: string; token: string; fileUrl: string };
  cover?: { uploadPath: string; token: string; contentType: string; publicUrl: string };
};

/**
 * Upload a sample's audio (and optional cover) DIRECTLY to Supabase Storage via
 * short-lived signed upload URLs, then return the stored references.
 *
 * The file bytes go browser -> Supabase, never through the Vercel function, so
 * they are not subject to the 4.5MB serverless request-body limit that 413'd
 * uploads when the file was POSTed through /api/upload/sample. The server still
 * gates the upload (auth + CREATOR + extension/size) when minting the signed
 * URL and re-validates the stored bytes in POST /api/samples.
 *
 * Returns the same `{ fileUrl, coverImageUrl }` shape the old multipart route
 * returned, so callers pass those straight to POST /api/samples.
 */
export async function uploadSampleFiles(
  audioFile: File,
  coverFile?: File | null
): Promise<{ fileUrl: string; coverImageUrl: string | null }> {
  // 1. Ask the server to mint signed upload slots (no bytes sent here).
  const mintRes = await fetch("/api/upload/sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: audioFile.name,
      size: audioFile.size,
      cover: coverFile ? { filename: coverFile.name, size: coverFile.size } : null,
    }),
  });

  if (!mintRes.ok) {
    const err = await mintRes.json().catch(() => ({}));
    throw new Error(err.error || "File upload failed");
  }

  const { audio, cover } = (await mintRes.json()) as MintResponse;
  const supabase = createClient();

  // 2. PUT the audio bytes straight to the samples bucket.
  const { error: audioError } = await supabase.storage
    .from("samples")
    .uploadToSignedUrl(audio.uploadPath, audio.token, audioFile, {
      contentType: "audio/wav",
    });
  if (audioError) throw new Error("File upload failed");

  // 3. PUT the cover (if any) straight to the covers bucket.
  let coverImageUrl: string | null = null;
  if (coverFile && cover) {
    const { error: coverError } = await supabase.storage
      .from("covers")
      .uploadToSignedUrl(cover.uploadPath, cover.token, coverFile, {
        contentType: cover.contentType,
      });
    if (coverError) throw new Error("Cover image upload failed");
    coverImageUrl = cover.publicUrl;
  }

  return { fileUrl: audio.fileUrl, coverImageUrl };
}

import { createClient } from "@/lib/supabase/client";

/**
 * Cheap client-side check that a File really is a RIFF/WAVE file (same magic
 * bytes the server verifies after upload). Catches non-audio files that merely
 * end in .wav — e.g. the `__MACOSX/._*.wav` AppleDouble metadata entries that
 * macOS puts in zips — before any bytes are uploaded, so the user gets a clear
 * per-file error instead of a server rejection after the fact.
 */
export async function looksLikeWav(file: File): Promise<boolean> {
  if (file.size < 12) return false;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
}

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
  // Fail fast on files that aren't real WAVs — the server would reject the
  // stored object anyway, after the bytes were already uploaded.
  if (!(await looksLikeWav(audioFile))) {
    throw new Error(
      `"${audioFile.name}" is not a valid WAV audio file (it may be corrupted or a metadata file)`
    );
  }

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
    throw new Error(err.error || `Upload could not start (HTTP ${mintRes.status})`);
  }

  const { audio, cover } = (await mintRes.json()) as MintResponse;
  const supabase = createClient();

  // 2. PUT the audio bytes straight to the samples bucket.
  const { error: audioError } = await supabase.storage
    .from("samples")
    .uploadToSignedUrl(audio.uploadPath, audio.token, audioFile, {
      contentType: "audio/wav",
    });
  if (audioError) {
    throw new Error(`Audio upload failed: ${audioError.message || "storage error"}`);
  }

  // 3. PUT the cover (if any) straight to the covers bucket.
  let coverImageUrl: string | null = null;
  if (coverFile && cover) {
    const { error: coverError } = await supabase.storage
      .from("covers")
      .uploadToSignedUrl(cover.uploadPath, cover.token, coverFile, {
        contentType: cover.contentType,
      });
    if (coverError) {
      throw new Error(`Cover image upload failed: ${coverError.message || "storage error"}`);
    }
    coverImageUrl = cover.publicUrl;
  }

  return { fileUrl: audio.fileUrl, coverImageUrl };
}

type PresetMintResponse = {
  preset: { uploadPath: string; token: string; fileUrl: string; contentType: string };
  preview: { uploadPath: string; token: string; previewUrl: string; contentType: string };
  cover?: { uploadPath: string; token: string; contentType: string; publicUrl: string };
};

/**
 * Upload a preset's file, its audio preview, and optional cover DIRECTLY to
 * Supabase Storage via signed upload URLs (bypasses Vercel's 4.5MB function
 * body limit). Returns the refs POST /api/presets expects.
 */
export async function uploadPresetFiles(
  presetFile: File,
  previewFile: File,
  coverFile?: File | null
): Promise<{
  fileUrl: string;
  previewUrl: string;
  coverImageUrl: string | null;
  fileSizeBytes: number;
}> {
  const mintRes = await fetch("/api/upload/preset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      preset: { filename: presetFile.name, size: presetFile.size },
      preview: { filename: previewFile.name, size: previewFile.size },
      cover: coverFile ? { filename: coverFile.name, size: coverFile.size } : null,
    }),
  });

  if (!mintRes.ok) {
    const err = await mintRes.json().catch(() => ({}));
    throw new Error(err.error || `Upload could not start (HTTP ${mintRes.status})`);
  }

  const { preset, preview, cover } = (await mintRes.json()) as PresetMintResponse;
  const supabase = createClient();

  const presetUp = await supabase.storage
    .from("presets")
    .uploadToSignedUrl(preset.uploadPath, preset.token, presetFile, {
      contentType: preset.contentType,
    });
  if (presetUp.error) {
    throw new Error(`Preset file upload failed: ${presetUp.error.message || "storage error"}`);
  }

  const previewUp = await supabase.storage
    .from("previews")
    .uploadToSignedUrl(preview.uploadPath, preview.token, previewFile, {
      contentType: preview.contentType,
    });
  if (previewUp.error) {
    throw new Error(`Audio preview upload failed: ${previewUp.error.message || "storage error"}`);
  }

  let coverImageUrl: string | null = null;
  if (coverFile && cover) {
    const coverUp = await supabase.storage
      .from("covers")
      .uploadToSignedUrl(cover.uploadPath, cover.token, coverFile, {
        contentType: cover.contentType,
      });
    if (coverUp.error) {
      throw new Error(`Cover image upload failed: ${coverUp.error.message || "storage error"}`);
    }
    coverImageUrl = cover.publicUrl;
  }

  return {
    fileUrl: preset.fileUrl,
    previewUrl: preview.previewUrl,
    coverImageUrl,
    fileSizeBytes: presetFile.size,
  };
}

/**
 * Upload a creator-application ZIP DIRECTLY to Supabase Storage via a signed
 * upload URL (bypasses Vercel's 4.5MB function body limit). Returns the same
 * `{ path, fileName }` the old multipart route returned.
 */
export async function uploadApplicationZip(
  zipFile: File
): Promise<{ path: string; fileName: string }> {
  const mintRes = await fetch("/api/upload/application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: zipFile.name, size: zipFile.size }),
  });

  if (!mintRes.ok) {
    const err = await mintRes.json().catch(() => ({}));
    throw new Error(err.error || "File upload failed");
  }

  const { uploadPath, token, path, fileName } = (await mintRes.json()) as {
    uploadPath: string;
    token: string;
    path: string;
    fileName: string;
  };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("applications")
    .uploadToSignedUrl(uploadPath, token, zipFile, {
      contentType: "application/zip",
    });
  if (error) {
    throw new Error(`File upload failed: ${error.message || "storage error"}`);
  }

  return { path, fileName };
}

/**
 * Upload a public profile image (avatar/banner) DIRECTLY to Supabase Storage
 * via a signed upload URL, then finalize (server re-validates the stored image
 * and saves it to the profile). Two calls to the same endpoint: mint, then
 * finalize. Bypasses Vercel's 4.5MB function body limit.
 */
async function uploadPublicImage(
  endpoint: string,
  bucket: string,
  file: File
): Promise<{ url: string }> {
  const mintRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size }),
  });
  if (!mintRes.ok) {
    const err = await mintRes.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  const { uploadPath, token, contentType } = (await mintRes.json()) as {
    uploadPath: string;
    token: string;
    contentType: string;
  };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(uploadPath, token, file, { contentType });
  if (error) {
    throw new Error(`Upload failed: ${error.message || "storage error"}`);
  }

  const finalizeRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finalizePath: uploadPath }),
  });
  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  const { url } = (await finalizeRes.json()) as { url: string };
  return { url };
}

export function uploadAvatar(file: File): Promise<{ url: string }> {
  return uploadPublicImage("/api/upload/avatar", "avatars", file);
}

export function uploadBanner(file: File): Promise<{ url: string }> {
  return uploadPublicImage("/api/upload/banner", "banners", file);
}

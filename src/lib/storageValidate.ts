/**
 * Post-upload content validation for objects that were uploaded DIRECTLY to
 * Supabase Storage by the browser (via signed upload URLs) and therefore never
 * passed through a server route.
 *
 * When the file streamed through `/api/upload/*` the route could validate the
 * bytes in-process. Direct-to-storage uploads bypass Vercel's 4.5MB function
 * body limit but move the bytes out of reach, so we re-validate the STORED
 * object here before publishing. This is the authoritative content/size check:
 * a client can PUT arbitrary bytes to its signed slot, and Supabase bucket
 * `allowedMimeTypes` is checked against the (spoofable) client Content-Type, so
 * only this magic-byte check + the bucket `fileSizeLimit` are trustworthy.
 *
 * Reads use a dedicated, session-free service-role client (never an SSR/cookie
 * client, which would run as the end user and hit RLS — see the storage notes).
 * Only the header bytes are read, so a 50MB object is not pulled back through
 * the function.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isWavBuffer, validateRasterImage } from "@/lib/upload";
import {
  hasZipLocalHeader,
  hasZipEocd,
  ZIP_EOCD_SCAN_BYTES,
} from "@/lib/zipIntegrity";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Read at most `n` bytes off the front of a fetch Response without buffering
 *  the whole body, whether or not the server honored the Range request. */
async function readFirstBytes(res: Response, n: number): Promise<Buffer> {
  if (!res.body) {
    return Buffer.from(await res.arrayBuffer()).subarray(0, n);
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < n) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      total += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, n);
}

/**
 * Fetch the first `n` bytes of a stored object plus its total size, via a
 * short-lived signed URL + an HTTP Range request. The storage-js `download()`
 * ignores custom headers, so a raw `fetch` is used to honor `Range`.
 */
async function readHead(
  bucket: string,
  path: string,
  n: number
): Promise<{ head: Buffer; size: number } | null> {
  const client = admin();
  const { data: signed, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 60);
  if (error || !signed) return null;

  const res = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=0-${n - 1}` },
  });
  if (!res.ok && res.status !== 206) return null;

  const head = await readFirstBytes(res, n);

  // Prefer the total size from Content-Range ("bytes 0-11/12345678"); fall back
  // to the object metadata if the server ignored Range (returned a 200).
  let size = 0;
  const cr = res.headers.get("content-range");
  if (cr && cr.includes("/")) {
    size = parseInt(cr.split("/")[1], 10) || 0;
  }
  if (!size) {
    const { data: info } = await client.storage.from(bucket).info(path);
    size = info?.size ?? head.length;
  }
  return { head, size };
}

/**
 * Fetch the byte range [start, end] of a stored object via a signed URL. If
 * the server ignores Range and returns the whole body (200), the requested
 * range here always runs to the object's end, so the buffer's tail is the
 * wanted slice either way. Callers cap object size first, so the 200 fallback
 * never buffers more than the relevant MAX_*_BYTES.
 */
async function readRange(
  bucket: string,
  path: string,
  start: number,
  end: number
): Promise<Buffer | null> {
  const client = admin();
  const { data: signed, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 60);
  if (error || !signed) return null;

  const res = await fetch(signed.signedUrl, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) return null;

  const body = Buffer.from(await res.arrayBuffer());
  const want = end - start + 1;
  return body.length > want ? body.subarray(body.length - want) : body;
}

/** Remove an object (best-effort cleanup of an invalid/orphaned upload). */
export async function removeObject(bucket: string, path: string): Promise<void> {
  try {
    await admin().storage.from(bucket).remove([path]);
  } catch {
    // best-effort
  }
}

/** Confirm a stored object is a real WAV within the audio size limit. */
export async function verifyStoredWav(
  bucket: string,
  path: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readHead(bucket, path, 12);
  if (!r) return { ok: false, error: "Uploaded audio could not be verified" };
  if (r.size === 0) return { ok: false, error: "Audio file is empty" };
  if (!isWavBuffer(r.head)) {
    return { ok: false, error: "Audio file must be a valid WAV" };
  }
  if (r.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: "Audio file must be under 50MB" };
  }
  return { ok: true };
}

/**
 * Confirm a stored object is a complete, openable ZIP within the size limit:
 * local-file-header magic at the front AND an End of Central Directory record
 * in the trailing ~64KB. Catches archives that were truncated on the
 * uploader's disk (file selected mid-compression or mid-cloud-sync) — those
 * upload "successfully" but no archive tool can open them. Reads only the
 * head and tail byte ranges, never the whole object.
 */
export async function verifyStoredZip(
  bucket: string,
  path: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readHead(bucket, path, 4);
  if (!r) return { ok: false, error: "Uploaded ZIP could not be verified" };
  if (r.size === 0) return { ok: false, error: "ZIP file is empty" };
  if (r.size > MAX_ZIP_BYTES) {
    return { ok: false, error: "ZIP file must be under 50MB" };
  }
  if (!hasZipLocalHeader(r.head)) {
    return { ok: false, error: "File is not a ZIP archive" };
  }

  const tailStart = Math.max(0, r.size - ZIP_EOCD_SCAN_BYTES);
  const tail = await readRange(bucket, path, tailStart, r.size - 1);
  if (!tail) return { ok: false, error: "Uploaded ZIP could not be verified" };
  if (!hasZipEocd(tail)) {
    return {
      ok: false,
      error:
        "The ZIP archive is incomplete or corrupted (it may have still been compressing or syncing when selected). Re-create the ZIP and upload it again.",
    };
  }
  return { ok: true };
}

/** Confirm a stored object is a real JPG/PNG/WebP within the image size limit.
 *  Matters for the public `covers` bucket, where a renamed active-content file
 *  would otherwise be served to browsers. */
export async function verifyStoredImage(
  bucket: string,
  path: string,
  maxBytes: number = MAX_COVER_BYTES
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readHead(bucket, path, 12);
  if (!r) return { ok: false, error: "Uploaded image could not be verified" };
  const filename = path.split("/").pop() || "";
  const check = validateRasterImage(filename, r.head);
  if (!check.ok) return { ok: false, error: check.error };
  if (r.size > maxBytes) return { ok: false, error: "Image file is too large" };
  return { ok: true };
}

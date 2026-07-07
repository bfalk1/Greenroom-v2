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

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

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

/** "%PDF-" header — the only stable magic bytes a PDF starts with. */
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
}

/** Confirm a stored payout receipt is a real PDF/PNG/JPEG (matching its
 *  extension) within the receipt size limit. */
export async function verifyStoredReceipt(
  bucket: string,
  path: string,
  maxBytes: number = MAX_RECEIPT_BYTES
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await readHead(bucket, path, 12);
  if (!r) return { ok: false, error: "Uploaded receipt could not be verified" };
  if (r.size === 0) return { ok: false, error: "Receipt file is empty" };
  if (r.size > maxBytes) return { ok: false, error: "Receipt must be under 10MB" };

  const ext = (path.split(".").pop() || "").toLowerCase();
  const isJpeg =
    r.head.length >= 3 &&
    r.head[0] === 0xff &&
    r.head[1] === 0xd8 &&
    r.head[2] === 0xff;
  const isPng =
    r.head.length >= 4 &&
    r.head[0] === 0x89 &&
    r.head[1] === 0x50 &&
    r.head[2] === 0x4e &&
    r.head[3] === 0x47;

  if (ext === "pdf" && isPdfBuffer(r.head)) return { ok: true };
  if ((ext === "jpg" || ext === "jpeg") && isJpeg) return { ok: true };
  if (ext === "png" && isPng) return { ok: true };
  return {
    ok: false,
    error: "Receipt must be a PDF, PNG, or JPG whose contents match its extension",
  };
}

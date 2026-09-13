/**
 * ACRCloud AI-music detection client + flag policy.
 *
 * Used by the ai-scan cron (src/app/api/cron/ai-scan) and the back-catalog
 * sweep (scripts/backfill-ai-scans.ts). Container 34732 runs engine=5, a
 * dedicated AI-music-detection engine — no fingerprinting, no buckets.
 *
 * API topology (verified live 2026-08-19): container management lives on
 * api-v2.acrcloud.com; file upload/results use the container's REGION host.
 * A scan returns ONE ai_detection entry spanning the whole file (no per-window
 * segments), with prediction ai_generated | human | no_music, ai_probability
 * 0-100, likely_source (suno | udio | … | "Human" | "Unknown AI") and
 * source_probabilities.
 *
 * Flag policy — calibrated 2026-08-19 on 5 known-AI stems + 24 presumed-human
 * prod samples: AI scored 83-91, humans 19-36, and every false positive was a
 * sub-3s clip. Hence: flag only ai_generated AND >=3s AND probability >=80.
 * This is an ADVISORY signal for the mod queue. A non-flag is never a human
 * guarantee (detector recall is measured on one Suno song so far), so no
 * "verified human" UI may be built on it.
 */

import { createClient } from "@supabase/supabase-js";

export const MIN_SCANNABLE_SEC = 3;
export const FLAG_MIN_PROBABILITY = 80;

/** Advisory flag decision. Duration comes from ACRCloud's own measurement. */
export function isFlagged(
  verdict: string | null,
  aiProbability: number | null,
  durationSec: number | null
): boolean {
  return (
    verdict === "ai_generated" &&
    (aiProbability ?? 0) >= FLAG_MIN_PROBABILITY &&
    (durationSec ?? 0) >= MIN_SCANNABLE_SEC
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function regionBase(): string {
  const host = process.env.ACRCLOUD_API_HOST ?? "https://api-us-west-2.acrcloud.com";
  return `${host}/api/fs-containers/${requireEnv("ACRCLOUD_CONTAINER_ID")}/files`;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${requireEnv("ACRCLOUD_BEARER_TOKEN")}` };
}

/** Upload audio bytes for scanning. Returns ACRCloud's file id to poll. */
export async function acrSubmit(bytes: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("data_type", "audio");
  form.append("file", new Blob([new Uint8Array(bytes)]), filename);
  const res = await fetch(regionBase(), { method: "POST", headers: authHeader(), body: form });
  if (!res.ok) {
    throw new Error(`ACRCloud upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const j = (await res.json()) as { data?: { id?: string }; id?: string };
  const id = j?.data?.id ?? j?.id;
  if (!id) throw new Error("ACRCloud upload response had no file id");
  return id;
}

export interface AcrScanResult {
  verdict: string; // ai_generated | human | no_music | …
  aiProbability: number | null;
  likelySource: string | null;
  durationSec: number | null;
  raw: unknown;
}

/**
 * Fetch a scan result. Returns null while ACRCloud is still processing.
 * Results GETs return the paginated {data: [...]} shape even for single files.
 */
export async function acrFetchResult(acrFileId: string): Promise<AcrScanResult | null> {
  const res = await fetch(`${regionBase()}/${acrFileId}`, { headers: authHeader() });
  if (!res.ok) {
    throw new Error(`ACRCloud result fetch failed: HTTP ${res.status}`);
  }
  const j = (await res.json()) as { data?: unknown };
  let data: any = j?.data ?? j;
  if (Array.isArray(data)) data = data[0];
  const det = data?.results?.ai_detection ?? data?.ai_detection;
  if (!det) return null;
  const entries = Array.isArray(det) ? det : [det];
  const d = entries.find((x: any) => x?.stem === "original") ?? entries[0];
  if (!d) return null;
  return {
    verdict: String(d.prediction ?? "unknown"),
    aiProbability: typeof d.ai_probability === "number" ? d.ai_probability : null,
    likelySource: d.likely_source != null ? String(d.likely_source) : null,
    durationSec: typeof d.duration === "number" ? d.duration : null,
    raw: entries,
  };
}

/**
 * Duration of a WAV from its RIFF header (data-chunk bytes / byte rate).
 * Returns null for anything that doesn't parse (non-WAV, truncated header).
 * Used to skip paying for scans on sub-3s clips; ACRCloud's own duration
 * remains the authoritative value stored on the scan row.
 */
export function parseWavDurationSec(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let byteRate: number | null = null;
  let dataSize: number | null = null;
  let off = 12;
  // Walk RIFF chunks; stop at data (its payload need not be present in buf).
  for (let i = 0; i < 64 && off + 8 <= buf.length; i++) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt " && off + 16 <= buf.length) {
      byteRate = buf.readUInt32LE(off + 16);
    }
    if (id === "data") {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  if (!byteRate || byteRate <= 0 || dataSize == null) return null;
  const sec = dataSize / byteRate;
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

/**
 * Download a stored object's bytes with the service-role client. The caller
 * MUST have validated the ref with isSafeStorageRef/isOwnedStorageRef first —
 * this helper only strips the bucket prefix and reads.
 */
export async function downloadStoredObject(bucket: string, ref: string): Promise<Buffer> {
  const path = ref.startsWith(`${bucket}/`) ? ref.slice(bucket.length + 1) : ref;
  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`storage download failed for ${bucket}/${path}: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

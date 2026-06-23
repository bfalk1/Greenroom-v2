/**
 * Lightweight fixed-window rate limiter.
 *
 * Uses the Vercel KV / Upstash Redis REST API when configured
 * (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, both provided automatically by the
 * Vercel KV integration). When those aren't set — local dev, or before KV is
 * provisioned — it falls back to a best-effort per-instance in-memory window so
 * nothing breaks. No external npm dependency.
 *
 * Apply to unauthenticated, side-effecting endpoints (email sends, DB writes,
 * expensive search) to blunt email-bombing, brute force, and scraping.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  limit: number;
};

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

// Per-instance fallback store. Bounded so a flood of distinct keys can't grow
// memory without limit.
const memory = new Map<string, { count: number; resetAt: number }>();
const MEMORY_MAX_KEYS = 10_000;

function memoryLimit(
  key: string,
  limit: number,
  windowSec: number
): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memory.size > MEMORY_MAX_KEYS) memory.clear();
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { success: true, remaining: limit - 1, limit };
  }
  entry.count += 1;
  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    limit,
  };
}

async function kvCommand(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV request failed: ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

/**
 * Consume one unit against `key`. Returns `success: false` once the window's
 * limit is exceeded. Never throws — on limiter-infra failure it fails OPEN
 * (allows the request) so the limiter can't take the site down.
 */
export async function rateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSec } = opts;
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const windowKey = `${key}:${bucket}`;

  if (!KV_URL || !KV_TOKEN) {
    return memoryLimit(windowKey, limit, windowSec);
  }

  try {
    const count = Number(await kvCommand(["INCR", `rl:${windowKey}`]));
    // Set the TTL only on the first hit of the window.
    if (count === 1) {
      await kvCommand(["EXPIRE", `rl:${windowKey}`, windowSec]);
    }
    return {
      success: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
    };
  } catch (err) {
    console.error("[rateLimit] KV error — allowing request:", err);
    return { success: true, remaining: limit, limit };
  }
}

/** Best-effort client identifier from proxy headers (Vercel sets these). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 response with a Retry-After hint. */
export function tooManyRequests(retryAfterSec = 60) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}

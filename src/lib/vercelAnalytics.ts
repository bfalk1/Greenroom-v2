// Vercel Web Analytics query client — the visitor-side data for the admin
// dashboard's conversion tiles.
//
// The site already ships @vercel/analytics (mounted in app/layout.tsx), so
// pageviews and unique visitors are being collected for every route with no
// extra instrumentation. What that data cannot do is identify a person: it
// answers "how many unique visitors hit /" but never "which of them signed
// up". Conversion tiles therefore pair this denominator with a numerator
// from our own database (see adminAnalytics.ts) rather than joining per
// user — the standard top-of-funnel rate, not a person-linked funnel.
//
// Needs VERCEL_ANALYTICS_TOKEN (a Vercel access token). Project and team ids
// default to this deployment's own, so normally only the token is set.

export class VercelAnalyticsNotConfiguredError extends Error {
  constructor() {
    super("Vercel Analytics API not configured (set VERCEL_ANALYTICS_TOKEN)");
    this.name = "VercelAnalyticsNotConfiguredError";
  }
}

export class VercelAnalyticsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VercelAnalyticsError";
    this.status = status;
  }
}

const API = "https://api.vercel.com/v1/query/web-analytics";

// Defaults are this project's own ids; overridable for local runs against a
// different project.
const DEFAULT_PROJECT_ID = "prj_RgwSiKgNmzL5Wfj7akHkOw3Mc3li";
const DEFAULT_TEAM_ID = "team_FAoqHtBNMSkxrg2D9AUjZ2HF";

function config() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    projectId: process.env.VERCEL_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID?.trim() || DEFAULT_TEAM_ID,
  };
}

export function vercelAnalyticsConfigured(): boolean {
  return config() !== null;
}

export interface VisitorPoint {
  /** Bucket start, as returned by the API (UTC ISO instant). */
  timestamp: string;
  visitors: number;
}

/** YYYY-MM-DD in UTC — the API's `since`/`until` format. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Daily unique visitors for one request path. Returns one row per day the
 * API reports; callers align these to their own bucket axis.
 */
export async function fetchDailyVisitors(
  requestPath: string,
  days: number
): Promise<VisitorPoint[]> {
  const cfg = config();
  if (!cfg) throw new VercelAnalyticsNotConfiguredError();
  if (!Number.isInteger(days) || days <= 0 || days > 400) {
    throw new Error(`Invalid day count: ${days}`);
  }
  // Single-quoted OData string; paths are internal constants, but reject
  // quotes anyway so a filter can never be broken out of.
  if (requestPath.includes("'")) throw new Error("Invalid request path");

  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 86_400_000);
  const params = new URLSearchParams({
    teamId: cfg.teamId,
    projectId: cfg.projectId,
    since: isoDay(since),
    until: isoDay(until),
    by: "day",
    environment: "production",
    filter: `requestPath eq '${requestPath}'`,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${API}/visits/aggregate?${params}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new VercelAnalyticsError(
      0,
      e instanceof DOMException && e.name === "AbortError"
        ? "Vercel Analytics query timed out"
        : "Vercel Analytics query failed to send"
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message || "";
    } catch {
      // non-JSON error body — status alone is enough
    }
    throw new VercelAnalyticsError(
      res.status,
      res.status === 403
        ? "Vercel Analytics token lacks access to this project"
        : `Vercel Analytics query failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const body = (await res.json()) as {
    data?: { timestamp?: string; visitors?: number }[];
  };
  return (body.data ?? [])
    .filter((r): r is { timestamp: string; visitors?: number } => !!r.timestamp)
    .map((r) => ({ timestamp: r.timestamp, visitors: Number(r.visitors) || 0 }));
}

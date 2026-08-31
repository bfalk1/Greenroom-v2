// Server-side PostHog HogQL query client — read path for the admin analytics
// dashboard (live/DAU/WAU/MAU + funnel conversion come from PostHog because
// the app database stores no pageviews or per-user activity history).
//
// This is the QUERY side of PostHog and needs a personal API key
// (POSTHOG_PERSONAL_API_KEY, "phx_…") plus POSTHOG_PROJECT_ID — the public
// NEXT_PUBLIC_POSTHOG_KEY used for event capture (analyticsServer.ts) cannot
// read data. Both extra envs are server-only secrets; when they're missing
// every caller gets PosthogNotConfiguredError and the dashboard renders its
// "connect PostHog" state instead of numbers — same inert-until-env pattern
// as the Google Ads tag.

export class PosthogNotConfiguredError extends Error {
  constructor() {
    super(
      "PostHog query API not configured (set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID)"
    );
    this.name = "PosthogNotConfiguredError";
  }
}

export class PosthogQueryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PosthogQueryError";
    this.status = status;
  }
}

interface QueryConfig {
  apiHost: string;
  projectId: string;
  apiKey: string;
}

function config(): QueryConfig | null {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  // The ingest host (us.i.posthog.com) does not serve the query API — the
  // private API lives on the bare region host. Derive it unless overridden.
  const apiHost =
    process.env.POSTHOG_API_HOST?.trim() ||
    (process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com")
      .replace("://us.i.", "://us.")
      .replace("://eu.i.", "://eu.");
  return { apiHost: apiHost.replace(/\/$/, ""), projectId, apiKey };
}

export function posthogQueryConfigured(): boolean {
  return config() !== null;
}

/**
 * Run a HogQL query and return raw result rows. Throws
 * PosthogNotConfiguredError when the env is missing and PosthogQueryError on
 * API failures (429 = the query API's rate limit; callers surface it rather
 * than retry-storming).
 *
 * PostHog caches API query results by default — fine for the historical
 * series, wrong for anything real-time. `forceFresh` bypasses the cache
 * (refresh: force_blocking); use it only for the live headcount.
 */
export async function hogql(
  query: string,
  opts?: { forceFresh?: boolean }
): Promise<unknown[][]> {
  const cfg = config();
  if (!cfg) throw new PosthogNotConfiguredError();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${cfg.apiHost}/api/projects/${cfg.projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query },
        refresh: opts?.forceFresh ? "force_blocking" : "blocking",
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new PosthogQueryError(
      0,
      e instanceof DOMException && e.name === "AbortError"
        ? "PostHog query timed out"
        : "PostHog query failed to send"
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string; error?: string };
      detail = body?.detail || body?.error || "";
    } catch {
      // non-JSON error body — status alone is enough
    }
    throw new PosthogQueryError(
      res.status,
      res.status === 429
        ? "PostHog query rate limit hit — try again in a minute"
        : `PostHog query failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const body = (await res.json()) as { results?: unknown[][] };
  return body.results ?? [];
}

/** First row of a HogQL result, with every value coerced to a number. */
export async function hogqlRow(
  query: string,
  opts?: { forceFresh?: boolean }
): Promise<number[]> {
  const rows = await hogql(query, opts);
  return (rows[0] ?? []).map((v) => Number(v) || 0);
}

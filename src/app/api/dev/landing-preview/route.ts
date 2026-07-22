import { NextResponse } from "next/server";

/**
 * DEV-ONLY proxy for the landing page's marketplace preview.
 *
 * On a fresh local database `/api/samples` is empty, so the interactive preview
 * has nothing real to audition. This route runs SERVER-SIDE (no browser CORS
 * limit) and forwards the public production catalog so local dev shows real,
 * distinct, playable sounds instead of the 2-clip demo. Signed preview URLs are
 * minted fresh by production on every request, so they never go stale.
 *
 * Returns 404 in production — the live `/api/samples` is the real source there.
 */

const PROD_ORIGIN = "https://www.greenroom.fm";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const qs = url.searchParams.toString() || "sortBy=popular&sortDir=desc&limit=24";

  try {
    const res = await fetch(`${PROD_ORIGIN}/api/samples?${qs}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({ samples: [], total: null }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    // Prod unreachable (offline) — let the client fall back to its static demo.
    return NextResponse.json({ samples: [], total: null }, { status: 200 });
  }
}

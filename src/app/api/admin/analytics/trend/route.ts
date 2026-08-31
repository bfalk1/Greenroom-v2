import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  fetchConversionDaily,
  fetchDauSeries,
  fetchDbTrendSeries,
  fetchLiveNow,
  fetchLiveSeries,
  fetchMauSeries,
  fetchWauSeries,
  type ConversionPoint,
  type Granularity,
  type LiveNow,
  type SeriesPoint,
} from "@/lib/adminAnalytics";
import {
  PosthogNotConfiguredError,
  PosthogQueryError,
} from "@/lib/posthogQuery";

/**
 * GET /api/admin/analytics/trend?metric=<key>&range=<key> — a single metric's
 * time series for the dashboard's drill-down view (ADMIN only).
 *
 * Each metric whitelists its own ranges (first entry = default). `live` also
 * returns the current 5-minute headcount — the overview polls this endpoint
 * for the live tile, so tile and drill-down share one query path.
 */

export const maxDuration = 30;

type MetricKey =
  | "live"
  | "dau"
  | "wau"
  | "mau"
  | "purchases"
  | "credits"
  | "subs"
  | "landing_conversion"
  | "promo_conversion";

// range key → interval count in the metric's own unit (null = all time).
const RANGES: Record<MetricKey, Record<string, number | null>> = {
  live: { "24h": 24, "48h": 48, "7d": 168 },
  dau: { "30d": 30, "90d": 90, "180d": 180 },
  wau: { "12w": 12, "26w": 26, "52w": 52 },
  mau: { "6m": 6, "12m": 12, "24m": 24 },
  purchases: { "30d": 30, "90d": 90, "180d": 180, all: null },
  credits: { "30d": 30, "90d": 90, "180d": 180, all: null },
  subs: { "30d": 30, "90d": 90, "180d": 180, all: null },
  landing_conversion: { "30d": 30, "90d": 90, "180d": 180 },
  promo_conversion: { "30d": 30, "90d": 90, "180d": 180 },
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const metric = (searchParams.get("metric") || "") as MetricKey;
    if (!(metric in RANGES)) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
    }
    const ranges = RANGES[metric];
    const range = searchParams.get("range") || Object.keys(ranges)[0];
    if (!(range in ranges)) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }
    const n = ranges[range];

    let granularity: Granularity;
    let series: SeriesPoint[] | ConversionPoint[];
    let live: LiveNow | undefined;

    switch (metric) {
      case "live": {
        granularity = "hour";
        [series, live] = await Promise.all([
          fetchLiveSeries(n as number),
          fetchLiveNow(),
        ]);
        break;
      }
      case "dau":
        granularity = "day";
        series = await fetchDauSeries(n as number);
        break;
      case "wau":
        granularity = "week";
        series = await fetchWauSeries(n as number);
        break;
      case "mau":
        granularity = "month";
        series = await fetchMauSeries(n as number);
        break;
      case "landing_conversion":
      case "promo_conversion":
        granularity = "day";
        series = await fetchConversionDaily(
          metric === "landing_conversion" ? "landing" : "promo",
          n as number
        );
        break;
      default: {
        const db = await fetchDbTrendSeries(metric, n);
        granularity = db.granularity;
        series = db.series;
      }
    }

    return NextResponse.json({
      metric,
      range,
      granularity,
      series,
      ...(live ? { live } : {}),
    });
  } catch (error) {
    if (error instanceof PosthogNotConfiguredError) {
      return NextResponse.json(
        { error: "posthog_not_configured" },
        { status: 503 }
      );
    }
    if (error instanceof PosthogQueryError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("GET /api/admin/analytics/trend error:", error);
    return NextResponse.json({ error: "Failed to load trend" }, { status: 500 });
  }
}

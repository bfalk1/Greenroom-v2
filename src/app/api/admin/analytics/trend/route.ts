import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveUserSeries,
  fetchActiveUserStats,
  fetchConversion,
  fetchDbTrendSeries,
  fetchSignupConversionSeries,
  type ConversionPoint,
  type Granularity,
  type SeriesPoint,
} from "@/lib/adminAnalytics";
import {
  VercelAnalyticsError,
  VercelAnalyticsNotConfiguredError,
} from "@/lib/vercelAnalytics";

/**
 * GET /api/admin/analytics/trend?metric=<key>&range=<key> — a single metric's
 * time series for the dashboard's drill-down view (ADMIN only).
 *
 * Each metric whitelists its own ranges (first entry = default). `active`
 * also returns the current headcount, so the overview tile and its
 * drill-down share one query path.
 */

export const maxDuration = 30;

type MetricKey =
  | "active"
  | "dau"
  | "wau"
  | "mau"
  | "purchases"
  | "credits"
  | "subs"
  | "landing_conversion"
  | "vip_conversion"
  | "signup_conversion";

// range key → interval count in the metric's own unit (null = all time).
const RANGES: Record<MetricKey, Record<string, number | null>> = {
  active: { "24h": 24, "48h": 48, "7d": 168 },
  dau: { "30d": 30, "90d": 90, "180d": 180 },
  wau: { "12w": 12, "26w": 26, "52w": 52 },
  mau: { "6m": 6, "12m": 12, "24m": 24 },
  purchases: { "30d": 30, "90d": 90, "180d": 180, all: null },
  credits: { "30d": 30, "90d": 90, "180d": 180, all: null },
  subs: { "30d": 30, "90d": 90, "180d": 180, all: null },
  landing_conversion: { "30d": 30, "90d": 90 },
  vip_conversion: { "30d": 30, "90d": 90 },
  // Weekly cohorts: daily signup cohorts are mostly noise at this volume.
  signup_conversion: { "12w": 12, "26w": 26, "52w": 52, all: null },
};

const GRANULARITY: Partial<Record<MetricKey, Granularity>> = {
  active: "hour",
  dau: "day",
  wau: "week",
  mau: "month",
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
    let activeNow: { current: number; windowMinutes: number } | undefined;

    switch (metric) {
      case "active":
      case "dau":
      case "wau":
      case "mau": {
        granularity = GRANULARITY[metric] as Granularity;
        series = await fetchActiveUserSeries(granularity, n as number);
        if (metric === "active") {
          const stats = await fetchActiveUserStats();
          activeNow = {
            current: stats.activeNow,
            windowMinutes: stats.activeWindowMinutes,
          };
        }
        break;
      }
      case "signup_conversion": {
        granularity = "week";
        series = await fetchSignupConversionSeries(n);
        break;
      }
      case "landing_conversion":
      case "vip_conversion": {
        granularity = "day";
        const result = await fetchConversion(
          metric === "landing_conversion" ? "landing" : "vip",
          n as number
        );
        series = result.series;
        break;
      }
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
      ...(activeNow ? { activeNow } : {}),
    });
  } catch (error) {
    if (error instanceof VercelAnalyticsNotConfiguredError) {
      return NextResponse.json(
        { error: "vercel_analytics_not_configured" },
        { status: 503 }
      );
    }
    if (error instanceof VercelAnalyticsError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("GET /api/admin/analytics/trend error:", error);
    return NextResponse.json({ error: "Failed to load trend" }, { status: 500 });
  }
}

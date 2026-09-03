import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveUserSeries,
  fetchActiveUserStats,
  fetchCommerceStats,
  fetchConversion,
  type ConversionPoint,
  type ConversionWindow,
} from "@/lib/adminAnalytics";
import { vercelAnalyticsConfigured } from "@/lib/vercelAnalytics";

/**
 * GET /api/admin/analytics — overview payload for the admin analytics
 * dashboard (ADMIN only).
 *
 * One fixed shape, no range param: every tile owns its natural window
 * (active-now = last hour, DAU = today, WAU/MAU = rolling 7/30 days,
 * commerce = today, conversion = rolling 30 days) and the drill-down trend
 * endpoint (/api/admin/analytics/trend) owns longer horizons.
 *
 * Everything except the conversion tiles comes from our own database and
 * always works. Conversion needs visitor counts from the Vercel Web
 * Analytics API (VERCEL_ANALYTICS_TOKEN); without it — or if that API errors
 * — `conversion` is null and the client simply omits those two tiles rather
 * than showing empty ones.
 */

export const maxDuration = 30;

interface ConversionPayload {
  window: ConversionWindow;
  series: ConversionPoint[];
}

export async function GET() {
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

    const conversionConfigured = vercelAnalyticsConfigured();

    const [
      activeStats,
      activeSeries,
      commerce,
      pendingApplications,
      samplesInReview,
      presetsInReview,
      conversions,
    ] = await Promise.all([
      fetchActiveUserStats(),
      // Sparkline for the DAU tile; the other active tiles reuse it at their
      // own granularity from the trend endpoint when opened.
      Promise.all([
        fetchActiveUserSeries("hour", 24),
        fetchActiveUserSeries("day", 30),
        fetchActiveUserSeries("week", 12),
        fetchActiveUserSeries("month", 12),
      ]),
      fetchCommerceStats(30),
      prisma.creatorApplication.count({ where: { status: "PENDING" } }),
      prisma.sample.count({ where: { status: "REVIEW" } }),
      prisma.preset.count({ where: { status: "REVIEW" } }),
      // Isolated: a Vercel Analytics outage must not blank the whole page.
      conversionConfigured
        ? Promise.allSettled([
            fetchConversion("landing", 30),
            fetchConversion("promo", 30),
          ])
        : Promise.resolve(null),
    ]);

    const [nowSeries, daySeries, weekSeries, monthSeries] = activeSeries;

    let conversionError: string | null = null;
    const settled = (
      r: PromiseSettledResult<ConversionPayload> | undefined
    ): ConversionPayload | null => {
      if (!r) return null;
      if (r.status === "fulfilled") return r.value;
      const msg =
        r.reason instanceof Error ? r.reason.message : "Conversion query failed";
      conversionError ??= msg;
      return null;
    };

    const landing = settled(conversions?.[0]);
    const promo = settled(conversions?.[1]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      engagement: {
        activeNow: {
          current: activeStats.activeNow,
          windowMinutes: activeStats.activeWindowMinutes,
          series: nowSeries,
        },
        dau: {
          today: activeStats.dauToday,
          yesterday: activeStats.dauYesterday,
          series: daySeries,
        },
        wau: {
          current: activeStats.wauCurrent,
          previous: activeStats.wauPrevious,
          series: weekSeries,
        },
        mau: {
          current: activeStats.mauCurrent,
          previous: activeStats.mauPrevious,
          series: monthSeries,
        },
      },
      commerce,
      conversion: {
        configured: conversionConfigured,
        error: conversionError,
        landing,
        promo,
      },
      actionItems: { pendingApplications, samplesInReview, presetsInReview },
    });
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

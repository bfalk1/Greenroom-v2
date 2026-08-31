import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveUserWindows,
  fetchCommerceStats,
  fetchConversionDaily,
  fetchConversionWindows,
  fetchDauSeries,
  fetchLiveNow,
  fetchLiveSeries,
  fetchMauSeries,
  fetchWauSeries,
} from "@/lib/adminAnalytics";
import { posthogQueryConfigured } from "@/lib/posthogQuery";

/**
 * GET /api/admin/analytics — overview payload for the admin analytics
 * dashboard (ADMIN only).
 *
 * One fixed shape, no range param: every tile owns its natural window (live =
 * last 5 min, DAU = today, WAU/MAU = rolling 7/30 days, commerce = today,
 * conversion = rolling 7 days) and the drill-down trend endpoint
 * (/api/admin/analytics/trend) owns longer horizons.
 *
 * PostHog-backed sections (engagement, conversion) come from the HogQL query
 * API and need POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID. Without them —
 * or when individual queries fail — those sections are null and the client
 * renders a setup/error state; DB-backed sections always load. Failures are
 * isolated per metric via allSettled so one slow query can't blank the page.
 */

// Nine PostHog queries fan out in parallel; leave headroom over the default
// serverless timeout for a cold ClickHouse cache.
export const maxDuration = 30;

function settle<T>(r: PromiseSettledResult<T>, errors: string[]): T | null {
  if (r.status === "fulfilled") return r.value;
  const msg =
    r.reason instanceof Error ? r.reason.message : "PostHog query failed";
  if (!errors.includes(msg)) errors.push(msg);
  return null;
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

    const configured = posthogQueryConfigured();
    const errors: string[] = [];

    const dbWork = Promise.all([
      fetchCommerceStats(30),
      prisma.creatorApplication.count({ where: { status: "PENDING" } }),
      prisma.sample.count({ where: { status: "REVIEW" } }),
      prisma.preset.count({ where: { status: "REVIEW" } }),
    ]);

    const posthogWork = configured
      ? Promise.allSettled([
          fetchLiveNow(),
          fetchLiveSeries(24),
          fetchActiveUserWindows(),
          fetchDauSeries(30),
          fetchWauSeries(12),
          fetchMauSeries(12),
          fetchConversionWindows(),
          fetchConversionDaily("landing", 30),
          fetchConversionDaily("promo", 30),
        ])
      : null;

    const [[commerce, pendingApplications, samplesInReview, presetsInReview], ph] =
      await Promise.all([dbWork, posthogWork]);

    let engagement: {
      live:
        | { total: number; identified: number; windowMinutes: number; series: unknown }
        | null;
      dau: { today: number; yesterday: number; series: unknown } | null;
      wau: { current: number; previous: number; series: unknown } | null;
      mau: { current: number; previous: number; series: unknown } | null;
    } = { live: null, dau: null, wau: null, mau: null };
    let conversion: {
      landing: { window: unknown; series: unknown } | null;
      promo: { window: unknown; series: unknown } | null;
    } = { landing: null, promo: null };

    if (ph) {
      const [
        liveNow,
        liveSeries,
        windows,
        dauSeries,
        wauSeries,
        mauSeries,
        convWindows,
        landingDaily,
        promoDaily,
      ] = ph;
      const live = settle(liveNow, errors);
      const win = settle(windows, errors);
      const conv = settle(convWindows, errors);
      engagement = {
        live: live ? { ...live, series: settle(liveSeries, errors) ?? [] } : null,
        dau: win
          ? {
              today: win.dauToday,
              yesterday: win.dauYesterday,
              series: settle(dauSeries, errors) ?? [],
            }
          : null,
        wau: win
          ? {
              current: win.wauCurrent,
              previous: win.wauPrevious,
              series: settle(wauSeries, errors) ?? [],
            }
          : null,
        mau: win
          ? {
              current: win.mauCurrent,
              previous: win.mauPrevious,
              series: settle(mauSeries, errors) ?? [],
            }
          : null,
      };
      conversion = {
        landing: conv
          ? { window: conv.landing, series: settle(landingDaily, errors) ?? [] }
          : null,
        promo: conv
          ? { window: conv.promo, series: settle(promoDaily, errors) ?? [] }
          : null,
      };
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      posthog: { configured, errors },
      engagement,
      commerce,
      conversion,
      actionItems: { pendingApplications, samplesInReview, presetsInReview },
    });
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

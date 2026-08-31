/**
 * Read-only smoke test for the admin analytics dashboard's data layer
 * (src/lib/adminAnalytics.ts). DB-backed metrics always run; PostHog-backed
 * metrics run only when POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set
 * (run it again after creating the key to validate the HogQL side).
 *
 * Usage (repo root — .env holds the production DATABASE_URL):
 *   /opt/homebrew/opt/node@20/bin/node --env-file=.env \
 *     node_modules/tsx/dist/cli.mjs --tsconfig ./tsconfig.json \
 *     scripts/verify-admin-analytics.ts
 */

import {
  fetchActiveUserWindows,
  fetchCommerceStats,
  fetchConversionDaily,
  fetchConversionWindows,
  fetchDauSeries,
  fetchDbTrendSeries,
  fetchLiveNow,
  fetchLiveSeries,
  fetchMauSeries,
  fetchWauSeries,
  type SeriesPoint,
} from "../src/lib/adminAnalytics";
import { posthogQueryConfigured } from "../src/lib/posthogQuery";
import { prisma } from "../src/lib/prisma";

function edges(series: SeriesPoint[]): string {
  if (!series.length) return "(empty)";
  const first = series[0];
  const last = series[series.length - 1];
  const nonZero = series.filter((p) => (p.value ?? 0) > 0).length;
  return `${series.length} pts [${first.date} … ${last.date}], ${nonZero} non-zero, last=${last.value}`;
}

async function main() {
  console.log("── DB metrics (Prisma) ──");
  const commerce = await fetchCommerceStats(30);
  for (const key of ["purchases", "credits", "subs"] as const) {
    const m = commerce[key];
    console.log(
      `${key}: today=${m.today} yesterday=${m.yesterday} last7=${m.last7} series ${edges(m.series)}`
    );
  }
  console.log(`subs activeTotal=${commerce.subs.activeTotal}`);

  // Cross-check: the all-time weekly series must sum to the table's own
  // totals — catches bucket-alignment bugs that drop rows.
  const expectedTotals = {
    purchases: await prisma.purchase.count(),
    credits:
      (await prisma.purchase.aggregate({ _sum: { creditsSpent: true } }))._sum
        .creditsSpent ?? 0,
    subs: await prisma.subscription.count(),
  };
  for (const metric of ["purchases", "credits", "subs"] as const) {
    const t90 = await fetchDbTrendSeries(metric, 90);
    const tall = await fetchDbTrendSeries(metric, null);
    console.log(`trend ${metric} 90d (${t90.granularity}): ${edges(t90.series)}`);
    console.log(`trend ${metric} all (${tall.granularity}): ${edges(tall.series)}`);
    const sum = tall.series.reduce((s, p) => s + (p.value ?? 0), 0);
    const expected = expectedTotals[metric];
    console.log(
      `  all-time sum ${sum} vs table total ${expected} → ${sum === expected ? "OK" : "MISMATCH"}`
    );
  }

  if (!posthogQueryConfigured()) {
    console.log(
      "\n── PostHog metrics skipped (set POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID to test) ──"
    );
    return;
  }

  console.log("\n── PostHog metrics (HogQL) ──");
  const liveNow = await fetchLiveNow();
  console.log(`live now: total=${liveNow.total} identified=${liveNow.identified}`);
  console.log(`live 24h: ${edges(await fetchLiveSeries(24))}`);
  const win = await fetchActiveUserWindows();
  console.log(
    `windows: dau ${win.dauToday}/${win.dauYesterday} wau ${win.wauCurrent}/${win.wauPrevious} mau ${win.mauCurrent}/${win.mauPrevious}`
  );
  console.log(`dau 30d: ${edges(await fetchDauSeries(30))}`);
  console.log(`wau 12w: ${edges(await fetchWauSeries(12))}`);
  console.log(`mau 12m: ${edges(await fetchMauSeries(12))}`);
  const convWin = await fetchConversionWindows();
  console.log(
    `landing 7d: ${convWin.landing.conversions}/${convWin.landing.visitors} (${convWin.landing.ratePct?.toFixed(2)}%) prev ${convWin.landing.prevConversions}/${convWin.landing.prevVisitors}`
  );
  console.log(
    `promo 7d: ${convWin.promo.conversions}/${convWin.promo.visitors} (${convWin.promo.ratePct?.toFixed(2)}%) prev ${convWin.promo.prevConversions}/${convWin.promo.prevVisitors}`
  );
  const landing = await fetchConversionDaily("landing", 30);
  const promo = await fetchConversionDaily("promo", 30);
  console.log(`landing daily 30d: ${edges(landing)}`);
  console.log(`promo daily 30d: ${edges(promo)}`);
}

main()
  .catch((e) => {
    console.error("verify-admin-analytics failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Read-only smoke test for the admin analytics data layer
 * (src/lib/adminAnalytics.ts). Database metrics — active users, purchases,
 * credits, subscribers — always run. The conversion metrics additionally
 * need VERCEL_ANALYTICS_TOKEN and are skipped without it.
 *
 * Usage (repo root — .env holds the production DATABASE_URL):
 *   /opt/homebrew/opt/node@20/bin/node --env-file=.env \
 *     node_modules/tsx/dist/cli.mjs --tsconfig ./tsconfig.json \
 *     scripts/verify-admin-analytics.ts
 *
 * Add a second --env-file, or prefix VERCEL_ANALYTICS_TOKEN=..., to exercise
 * the conversion queries too.
 */

import {
  fetchActiveUserSeries,
  fetchActiveUserStats,
  fetchCommerceStats,
  fetchConversion,
  fetchDbTrendSeries,
  fetchSignupConversion,
  fetchSignupConversionSeries,
  type SeriesPoint,
} from "../src/lib/adminAnalytics";
import { vercelAnalyticsConfigured } from "../src/lib/vercelAnalytics";
import { prisma } from "../src/lib/prisma";

function edges(series: SeriesPoint[]): string {
  if (!series.length) return "(empty)";
  const last = series[series.length - 1];
  const nonZero = series.filter((p) => (p.value ?? 0) > 0).length;
  return `${series.length} pts [${series[0].date} … ${last.date}], ${nonZero} non-zero, last=${last.value}`;
}

async function main() {
  console.log("── Active users (Supabase auth session history) ──");
  const active = await fetchActiveUserStats();
  console.log(
    `active last ${active.activeWindowMinutes}m=${active.activeNow} | ` +
      `DAU ${active.dauToday} (yest ${active.dauYesterday}) | ` +
      `WAU ${active.wauCurrent} (prev ${active.wauPrevious}) | ` +
      `MAU ${active.mauCurrent} (prev ${active.mauPrevious})`
  );
  for (const [g, n] of [
    ["hour", 24],
    ["day", 30],
    ["week", 12],
    ["month", 12],
  ] as const) {
    console.log(`${g} x${n}: ${edges(await fetchActiveUserSeries(g, n))}`);
  }

  console.log("\n── Commerce (app database) ──");
  const commerce = await fetchCommerceStats(30);
  for (const key of ["purchases", "credits", "subs"] as const) {
    const m = commerce[key];
    console.log(
      `${key}: today=${m.today} yesterday=${m.yesterday} last7=${m.last7} | ${edges(m.series)}`
    );
  }
  console.log(`subs activeTotal=${commerce.subs.activeTotal}`);

  // Cross-check: the all-time weekly series must sum to the table's own
  // totals — catches bucket-alignment bugs that silently drop rows.
  const expectedTotals = {
    purchases: await prisma.purchase.count(),
    credits:
      (await prisma.purchase.aggregate({ _sum: { creditsSpent: true } }))._sum
        .creditsSpent ?? 0,
    subs: await prisma.subscription.count(),
  };
  for (const metric of ["purchases", "credits", "subs"] as const) {
    const all = await fetchDbTrendSeries(metric, null);
    const sum = all.series.reduce((s, p) => s + (p.value ?? 0), 0);
    const expected = expectedTotals[metric];
    console.log(
      `trend ${metric} all (${all.granularity}): ${edges(all.series)}\n` +
        `  all-time sum ${sum} vs table total ${expected} → ${sum === expected ? "OK" : "MISMATCH"}`
    );
  }

  console.log("\n── Signup → paid conversion (database) ──");
  const signup = await fetchSignupConversion(30);
  console.log(
    `last 30d: ${signup.conversions}/${signup.visitors} = ${signup.ratePct?.toFixed(1) ?? "—"}% ` +
      `(prev ${signup.prevConversions}/${signup.prevVisitors} = ${signup.prevRatePct?.toFixed(1) ?? "—"}%)`
  );
  for (const p of (await fetchSignupConversionSeries(10)).slice(-10)) {
    console.log(
      `  ${p.date}: ${p.conversions}/${p.visitors} = ${p.value?.toFixed(1) ?? "—"}%`
    );
  }

  if (!vercelAnalyticsConfigured()) {
    console.log(
      "\n── Conversion skipped (set VERCEL_ANALYTICS_TOKEN to test) ──"
    );
    return;
  }

  console.log("\n── Conversion (Vercel visitors + DB conversions) ──");
  for (const kind of ["pricing", "vip"] as const) {
    const { window: w, series } = await fetchConversion(kind, 30);
    console.log(
      `${kind}: ${w.conversions}/${w.visitors} = ${w.ratePct?.toFixed(2) ?? "—"}% ` +
        `(prev ${w.prevConversions}/${w.prevVisitors} = ${w.prevRatePct?.toFixed(2) ?? "—"}%)`
    );
    console.log(`  series: ${edges(series)}`);
  }
}

main()
  .catch((e) => {
    console.error("verify-admin-analytics failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { prisma } from "@/lib/prisma";
import { hogql, hogqlRow } from "@/lib/posthogQuery";

// Metric builders for the admin analytics dashboard (overview + trend
// drill-downs). Two data sources, split by what each actually records:
//
// - PostHog (HogQL): everything about *people using the product* — live
//   users, DAU/WAU/MAU, and the landing/promo conversion funnels. The app DB
//   has no pageviews and no per-user activity history, so these cannot come
//   from Prisma.
// - Prisma: everything that is *a business record* — purchases, credits
//   spent, new subscriptions. These live in the DB with full history and
//   should not depend on an external analytics vendor.
//
// Timezone note: PostHog buckets days in the project's timezone, DB series
// use server-local midnight (UTC on Vercel). Each metric is internally
// consistent; the two families can disagree about where "today" starts by a
// few hours. Chart axes for PostHog metrics are therefore derived from the
// buckets PostHog returns (see axisFromReturned) instead of the server clock.

export type Granularity = "hour" | "day" | "week" | "month";

export interface SeriesPoint {
  date: string;
  value: number | null;
}

export interface ConversionPoint {
  date: string;
  /** Daily conversion rate in percent; null when the day had no visitors. */
  value: number | null;
  visitors: number;
  conversions: number;
}

// ── Identified-user predicate ─────────────────────────────────────────────
// person_profiles is "identified_only", so anonymous visitors have no person
// row and no email — this cleanly restricts active-user counts to signed-in
// users while conversion denominators (below) still count anonymous traffic.
// Parenthesised: this is interpolated both into WHERE chains and into
// uniqIf() predicates. A missing property can come back as an empty
// string rather than NULL, which would silently count anonymous
// visitors as signed-in users, so both are excluded.
const IDENTIFIED =
  "(person.properties.email IS NOT NULL AND person.properties.email != '')";

// The two funnels. Denominator/numerator conditions are same-day per person:
// "of the people who saw the page that day, how many converted that day".
// promo_offer_viewed double-fires on client navs (documented in analytics.ts)
// but uniq(person_id) makes that harmless here.
const FUNNELS = {
  landing: {
    view: "(event = '$pageview' AND properties.$pathname = '/')",
    convert: "(event = 'signup')",
  },
  promo: {
    view: "(event = 'promo_offer_viewed')",
    convert: "(event = 'subscription_activated')",
  },
} as const;

export type FunnelKind = keyof typeof FUNNELS;

function intOrThrow(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 4000) {
    throw new Error(`Invalid interval count: ${n}`);
  }
  return n;
}

// ── Bucket-key helpers ────────────────────────────────────────────────────
// Keys follow the existing dashboard convention the client formatter already
// parses: hour "YYYY-MM-DDTHH", day/week "YYYY-MM-DD" (Monday-start weeks),
// month "YYYY-MM".

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function keyOf(d: Date, g: Granularity): string {
  const t = g === "week" ? mondayOf(d) : d;
  const day = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  if (g === "hour") return `${day}T${pad2(t.getHours())}`;
  if (g === "month") return day.slice(0, 7);
  return day;
}

function parseKey(key: string, g: Granularity): Date {
  if (g === "hour") {
    const [day, hour] = key.split("T");
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d, Number(hour));
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d ?? 1);
}

function step(d: Date, g: Granularity): Date {
  const x = new Date(d);
  if (g === "hour") x.setHours(x.getHours() + 1);
  else if (g === "day") x.setDate(x.getDate() + 1);
  else if (g === "week") x.setDate(x.getDate() + 7);
  else x.setMonth(x.getMonth() + 1);
  return x;
}

function stepBack(d: Date, g: Granularity, n: number): Date {
  const x = new Date(d);
  if (g === "hour") x.setHours(x.getHours() - n);
  else if (g === "day") x.setDate(x.getDate() - n);
  else if (g === "week") x.setDate(x.getDate() - 7 * n);
  else x.setMonth(x.getMonth() - n);
  return x;
}

/** Server-local bucket start for "now", aligned like keyOf. */
function currentBucketStart(g: Granularity): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  if (g !== "hour") d.setHours(0, 0, 0, 0);
  if (g === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (g === "month") d.setDate(1);
  return d;
}

/**
 * Gap-fill a bucket→value map into a contiguous series of `count` buckets.
 * The axis is anchored to the newest bucket the source returned (so PostHog
 * series stay aligned to the project timezone's clock, not the server's);
 * when the source returned nothing, it falls back to the server clock so the
 * chart still shows an honest all-zero window.
 */
function fillSeries(
  returned: Map<string, number>,
  g: Granularity,
  count: number
): SeriesPoint[] {
  const keys = Array.from(returned.keys()).sort();
  const endKey = keys.length
    ? keys[keys.length - 1]
    : keyOf(currentBucketStart(g), g);
  let cursor = stepBack(parseKey(endKey, g), g, count - 1);
  // A source bucket older than the computed window start (shouldn't happen,
  // but keys are data) widens the window rather than being dropped.
  if (keys.length && parseKey(keys[0], g) < cursor) cursor = parseKey(keys[0], g);
  const end = parseKey(endKey, g);
  const out: SeriesPoint[] = [];
  while (cursor <= end && out.length < 4000) {
    const k = keyOf(cursor, g);
    out.push({ date: k, value: returned.get(k) ?? 0 });
    cursor = step(cursor, g);
  }
  return out;
}

/** Rows of [bucketKey, ...numbers] → Map(bucketKey → first number). */
function rowsToMap(rows: unknown[][]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[0] ?? "");
    if (!key) continue;
    map.set(key, Number(row[1]) || 0);
  }
  return map;
}

// HogQL bucket expressions producing the key formats above. Weeks use
// toMonday() to match the dashboard's Monday-start convention.
const BUCKET_EXPR: Record<Granularity, string> = {
  hour: "formatDateTime(toStartOfHour(timestamp), '%Y-%m-%dT%H')",
  day: "formatDateTime(toStartOfDay(timestamp), '%Y-%m-%d')",
  week: "formatDateTime(toMonday(timestamp), '%Y-%m-%d')",
  month: "formatDateTime(toStartOfMonth(timestamp), '%Y-%m')",
};

// ── PostHog: active users ─────────────────────────────────────────────────

export interface LiveNow {
  /** Unique people (signed-in or anonymous) with any event in the window. */
  total: number;
  identified: number;
  windowMinutes: number;
}

const LIVE_WINDOW_MINUTES = 5;

export async function fetchLiveNow(): Promise<LiveNow> {
  const [total, identified] = await hogqlRow(
    `
    SELECT uniq(person_id) AS total,
           uniqIf(person_id, ${IDENTIFIED}) AS identified
    FROM events
    WHERE timestamp >= now() - INTERVAL ${LIVE_WINDOW_MINUTES} MINUTE
  `,
    // PostHog caches API queries; a cached "live" number defeats the tile.
    { forceFresh: true }
  );
  return { total, identified, windowMinutes: LIVE_WINDOW_MINUTES };
}

/** Hourly unique visitors (anonymous included — matches the live tile). */
export async function fetchLiveSeries(hours: number): Promise<SeriesPoint[]> {
  const n = intOrThrow(hours);
  const rows = await hogql(`
    SELECT ${BUCKET_EXPR.hour} AS bucket, uniq(person_id) AS value
    FROM events
    WHERE timestamp >= now() - INTERVAL ${n} HOUR
    GROUP BY bucket ORDER BY bucket
  `);
  return fillSeries(rowsToMap(rows), "hour", n);
}

/** Daily unique signed-in users. */
export async function fetchDauSeries(days: number): Promise<SeriesPoint[]> {
  const n = intOrThrow(days);
  const rows = await hogql(`
    SELECT ${BUCKET_EXPR.day} AS bucket, uniq(person_id) AS value
    FROM events
    WHERE timestamp >= toStartOfDay(now()) - INTERVAL ${n - 1} DAY
      AND ${IDENTIFIED}
    GROUP BY bucket ORDER BY bucket
  `);
  return fillSeries(rowsToMap(rows), "day", n);
}

/** Weekly (Monday-start) unique signed-in users. */
export async function fetchWauSeries(weeks: number): Promise<SeriesPoint[]> {
  const n = intOrThrow(weeks);
  const rows = await hogql(`
    SELECT ${BUCKET_EXPR.week} AS bucket, uniq(person_id) AS value
    FROM events
    WHERE timestamp >= toMonday(now()) - INTERVAL ${n - 1} WEEK
      AND ${IDENTIFIED}
    GROUP BY bucket ORDER BY bucket
  `);
  return fillSeries(rowsToMap(rows), "week", n);
}

/** Monthly unique signed-in users. */
export async function fetchMauSeries(months: number): Promise<SeriesPoint[]> {
  const n = intOrThrow(months);
  const rows = await hogql(`
    SELECT ${BUCKET_EXPR.month} AS bucket, uniq(person_id) AS value
    FROM events
    WHERE timestamp >= toStartOfMonth(now()) - INTERVAL ${n - 1} MONTH
      AND ${IDENTIFIED}
    GROUP BY bucket ORDER BY bucket
  `);
  return fillSeries(rowsToMap(rows), "month", n);
}

export interface ActiveUserWindows {
  dauToday: number;
  dauYesterday: number;
  /** Rolling 7 days ending now vs the 7 before. */
  wauCurrent: number;
  wauPrevious: number;
  /** Rolling 30 days ending now vs the 30 before. */
  mauCurrent: number;
  mauPrevious: number;
}

export async function fetchActiveUserWindows(): Promise<ActiveUserWindows> {
  const [
    dauToday,
    dauYesterday,
    wauCurrent,
    wauPrevious,
    mauCurrent,
    mauPrevious,
  ] = await hogqlRow(`
    SELECT
      uniqIf(person_id, timestamp >= toStartOfDay(now())) AS dau_today,
      uniqIf(person_id, timestamp >= toStartOfDay(now()) - INTERVAL 1 DAY
                    AND timestamp <  toStartOfDay(now())) AS dau_yesterday,
      uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY) AS wau_current,
      uniqIf(person_id, timestamp >= now() - INTERVAL 14 DAY
                    AND timestamp <  now() - INTERVAL 7 DAY) AS wau_previous,
      uniqIf(person_id, timestamp >= now() - INTERVAL 30 DAY) AS mau_current,
      uniqIf(person_id, timestamp >= now() - INTERVAL 60 DAY
                    AND timestamp <  now() - INTERVAL 30 DAY) AS mau_previous
    FROM events
    WHERE timestamp >= now() - INTERVAL 60 DAY
      AND ${IDENTIFIED}
  `);
  return { dauToday, dauYesterday, wauCurrent, wauPrevious, mauCurrent, mauPrevious };
}

// ── PostHog: conversion funnels ───────────────────────────────────────────

/**
 * Daily same-day funnel: unique people who saw the page that day, and how
 * many of them converted the same day.
 */
export async function fetchConversionDaily(
  kind: FunnelKind,
  days: number
): Promise<ConversionPoint[]> {
  const n = intOrThrow(days);
  const f = FUNNELS[kind];
  const rows = await hogql(`
    SELECT day,
           countIf(viewed) AS visitors,
           countIf(viewed AND converted) AS conversions
    FROM (
      SELECT ${BUCKET_EXPR.day} AS day,
             person_id,
             countIf(${f.view}) > 0 AS viewed,
             countIf(${f.convert}) > 0 AS converted
      FROM events
      WHERE timestamp >= toStartOfDay(now()) - INTERVAL ${n - 1} DAY
        AND (${f.view} OR ${f.convert})
      GROUP BY day, person_id
    )
    GROUP BY day ORDER BY day
  `);
  const byKey = new Map<string, { visitors: number; conversions: number }>();
  for (const row of rows) {
    byKey.set(String(row[0] ?? ""), {
      visitors: Number(row[1]) || 0,
      conversions: Number(row[2]) || 0,
    });
  }
  // Reuse the numeric gap-filler for the axis, then rehydrate the pair data.
  const axis = fillSeries(
    new Map(Array.from(byKey.entries()).map(([k, v]) => [k, v.visitors])),
    "day",
    n
  );
  return axis.map((p) => {
    const d = byKey.get(p.date) ?? { visitors: 0, conversions: 0 };
    return {
      date: p.date,
      value: d.visitors > 0 ? (d.conversions / d.visitors) * 100 : null,
      visitors: d.visitors,
      conversions: d.conversions,
    };
  });
}

export interface ConversionWindow {
  visitors: number;
  conversions: number;
  ratePct: number | null;
  prevVisitors: number;
  prevConversions: number;
  prevRatePct: number | null;
}

/**
 * Rolling 7-day funnel windows for both funnels in one scan: unique people
 * who saw the page in the window and converted in the same window, vs the
 * previous 7 days.
 */
export async function fetchConversionWindows(): Promise<{
  landing: ConversionWindow;
  promo: ConversionWindow;
}> {
  const l = FUNNELS.landing;
  const p = FUNNELS.promo;
  const cur = "timestamp >= now() - INTERVAL 7 DAY";
  const prev =
    "timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY";
  const row = await hogqlRow(`
    SELECT
      countIf(l_view_cur) AS l_visitors_cur,
      countIf(l_view_cur AND l_conv_cur) AS l_conversions_cur,
      countIf(l_view_prev) AS l_visitors_prev,
      countIf(l_view_prev AND l_conv_prev) AS l_conversions_prev,
      countIf(p_view_cur) AS p_visitors_cur,
      countIf(p_view_cur AND p_conv_cur) AS p_conversions_cur,
      countIf(p_view_prev) AS p_visitors_prev,
      countIf(p_view_prev AND p_conv_prev) AS p_conversions_prev
    FROM (
      SELECT person_id,
             countIf(${l.view} AND ${cur}) > 0 AS l_view_cur,
             countIf(${l.convert} AND ${cur}) > 0 AS l_conv_cur,
             countIf(${l.view} AND ${prev}) > 0 AS l_view_prev,
             countIf(${l.convert} AND ${prev}) > 0 AS l_conv_prev,
             countIf(${p.view} AND ${cur}) > 0 AS p_view_cur,
             countIf(${p.convert} AND ${cur}) > 0 AS p_conv_cur,
             countIf(${p.view} AND ${prev}) > 0 AS p_view_prev,
             countIf(${p.convert} AND ${prev}) > 0 AS p_conv_prev
      FROM events
      WHERE timestamp >= now() - INTERVAL 14 DAY
        AND (${l.view} OR ${l.convert} OR ${p.view} OR ${p.convert})
      GROUP BY person_id
    )
  `);
  const windowOf = (offset: number): ConversionWindow => {
    const [visitors, conversions, prevVisitors, prevConversions] = row.slice(
      offset,
      offset + 4
    );
    return {
      visitors,
      conversions,
      ratePct: visitors > 0 ? (conversions / visitors) * 100 : null,
      prevVisitors,
      prevConversions,
      prevRatePct: prevVisitors > 0 ? (prevConversions / prevVisitors) * 100 : null,
    };
  };
  return { landing: windowOf(0), promo: windowOf(4) };
}

// ── Prisma: purchases, credits, new subscribers ───────────────────────────

/** Server-local day-bucketed series generated from row timestamps. */
function dbDailySeries(
  rows: { at: Date; value: number }[],
  days: number
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r.at, "day");
    map.set(k, (map.get(k) ?? 0) + r.value);
  }
  const start = stepBack(currentBucketStart("day"), "day", days - 1);
  const out: SeriesPoint[] = [];
  for (let d = start; out.length < days; d = step(d, "day")) {
    const k = keyOf(d, "day");
    out.push({ date: k, value: map.get(k) ?? 0 });
  }
  return out;
}

function sumWhere(
  rows: { at: Date; value: number }[],
  from: Date,
  to?: Date
): number {
  let s = 0;
  for (const r of rows) {
    if (r.at >= from && (!to || r.at < to)) s += r.value;
  }
  return s;
}

export interface DailyMetric {
  today: number;
  yesterday: number;
  last7: number;
  series: SeriesPoint[];
}

export interface CommerceStats {
  purchases: DailyMetric;
  credits: DailyMetric;
  subs: DailyMetric & { activeTotal: number };
}

export async function fetchCommerceStats(seriesDays: number): Promise<CommerceStats> {
  const todayStart = currentBucketStart("day");
  const yesterdayStart = stepBack(todayStart, "day", 1);
  const seriesStart = stepBack(todayStart, "day", seriesDays - 1);
  const last7Start = stepBack(todayStart, "day", 6);
  const fetchStart = new Date(
    Math.min(seriesStart.getTime(), stepBack(todayStart, "day", 7).getTime())
  );
  const now = new Date();

  const [purchaseRows, subRows, activeTotal] = await Promise.all([
    prisma.purchase.findMany({
      where: { createdAt: { gte: fetchStart } },
      select: { createdAt: true, creditsSpent: true },
    }),
    prisma.subscription.findMany({
      where: { createdAt: { gte: fetchStart } },
      select: { createdAt: true },
    }),
    // Real, currently-active subscription records (provider-backed, not past
    // their period) — excludes beta comps and stale status flags. Same
    // definition as the subscribers panel.
    prisma.subscription.count({
      where: {
        currentPeriodEnd: { gte: now },
        OR: [
          { stripeSubscriptionId: { not: null } },
          { paypalSubscriptionId: { not: null } },
        ],
      },
    }),
  ]);

  const purchaseCounts = purchaseRows.map((r) => ({ at: r.createdAt, value: 1 }));
  const creditSums = purchaseRows.map((r) => ({
    at: r.createdAt,
    value: r.creditsSpent,
  }));
  const subCounts = subRows.map((r) => ({ at: r.createdAt, value: 1 }));

  const metric = (rows: { at: Date; value: number }[]): DailyMetric => ({
    today: sumWhere(rows, todayStart),
    yesterday: sumWhere(rows, yesterdayStart, todayStart),
    last7: sumWhere(rows, last7Start),
    series: dbDailySeries(rows, seriesDays),
  });

  return {
    purchases: metric(purchaseCounts),
    credits: metric(creditSums),
    subs: { ...metric(subCounts), activeTotal },
  };
}

export type DbTrendMetric = "purchases" | "credits" | "subs";

/**
 * Trend series for a DB metric. `days` = null means "all time", bucketed
 * weekly so the point count stays bounded; bounded ranges are daily.
 */
export async function fetchDbTrendSeries(
  metric: DbTrendMetric,
  days: number | null
): Promise<{ granularity: Granularity; series: SeriesPoint[] }> {
  const granularity: Granularity = days == null ? "week" : "day";
  const start =
    days == null
      ? new Date(0)
      : stepBack(currentBucketStart("day"), "day", intOrThrow(days) - 1);

  const rows =
    metric === "subs"
      ? (
          await prisma.subscription.findMany({
            where: { createdAt: { gte: start } },
            select: { createdAt: true },
          })
        ).map((r) => ({ at: r.createdAt, value: 1 }))
      : (
          await prisma.purchase.findMany({
            where: { createdAt: { gte: start } },
            select: { createdAt: true, creditsSpent: true },
          })
        ).map((r) => ({
          at: r.createdAt,
          value: metric === "credits" ? r.creditsSpent : 1,
        }));

  if (granularity === "day") {
    return { granularity, series: dbDailySeries(rows, days as number) };
  }

  // All-time weekly: axis from the first row (or an empty 1-bucket series).
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r.at, "week");
    map.set(k, (map.get(k) ?? 0) + r.value);
  }
  const end = currentBucketStart("week");
  let cursor = rows.length
    ? parseKey(Array.from(map.keys()).sort()[0], "week")
    : end;
  const series: SeriesPoint[] = [];
  while (cursor <= end && series.length < 600) {
    const k = keyOf(cursor, "week");
    series.push({ date: k, value: map.get(k) ?? 0 });
    cursor = step(cursor, "week");
  }
  return { granularity, series };
}

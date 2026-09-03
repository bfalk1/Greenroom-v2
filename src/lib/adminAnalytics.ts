import { prisma } from "@/lib/prisma";
import { fetchDailyVisitors } from "@/lib/vercelAnalytics";

// Metric builders for the admin analytics dashboard (overview + trend
// drill-downs). Three sources, split by what each can actually answer:
//
// - Prisma (app DB): business records — purchases, credits spent, new
//   subscriptions, signups.
// - Prisma (Supabase `auth` schema): session activity, which gives
//   DAU/WAU/MAU without any analytics vendor. See the note above
//   fetchActiveUserStats for what that does and doesn't measure.
// - Vercel Web Analytics: anonymous visitor counts per route. The app
//   database never sees a visitor who doesn't sign up, so this is the only
//   possible source for a conversion-rate denominator.
//
// Days are bucketed in the server's timezone (UTC on Vercel) for DB series,
// and in UTC for conversion series, since Vercel returns UTC day buckets.

export type Granularity = "hour" | "day" | "week" | "month";

export interface SeriesPoint {
  date: string;
  value: number | null;
}

// ── Shared bucket helpers ────────────────────────────────────────────────

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

// ── DB: active users (Supabase auth session history) ──────────────────────
// Supabase/GoTrue rotates a refresh token roughly hourly while a session is
// in use, so `auth.refresh_tokens.created_at` is a dense record of "this user
// was signed in and using the app at this moment" — around 8 rows/day per
// active user, with unpruned history back to the project's first sign-ins.
// That makes DAU/WAU/MAU computable from our own database.
//
// Honest limits: this counts authenticated sessions, so it misses signed-out
// browsing (little of the product is usable signed out), and a long-lived
// background tab that quietly refreshes counts as active. It is a
// session-activity metric, not a behavioural one — hence "Active in the last
// hour" rather than a live 5-minute headcount, which the ~hourly refresh
// cadence cannot support.
//
// The table is outside the Prisma schema, hence raw SQL. Every interpolated
// value is an integer validated by intOrThrow or a literal from this file.

export interface ActiveUserStats {
  activeNow: number;
  dauToday: number;
  dauYesterday: number;
  wauCurrent: number;
  wauPrevious: number;
  mauCurrent: number;
  mauPrevious: number;
  activeWindowMinutes: number;
}

export const ACTIVE_NOW_WINDOW_MINUTES = 60;

export async function fetchActiveUserStats(): Promise<ActiveUserStats> {
  const rows = await prisma.$queryRawUnsafe<Record<string, bigint | number>[]>(`
    SELECT
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= now() - interval '${ACTIVE_NOW_WINDOW_MINUTES} minutes') AS active_now,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= date_trunc('day', now())) AS dau_today,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= date_trunc('day', now()) - interval '1 day'
          AND created_at <  date_trunc('day', now())) AS dau_yesterday,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= now() - interval '7 days') AS wau_current,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= now() - interval '14 days'
          AND created_at <  now() - interval '7 days') AS wau_previous,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= now() - interval '30 days') AS mau_current,
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= now() - interval '60 days'
          AND created_at <  now() - interval '30 days') AS mau_previous
    FROM auth.refresh_tokens
    WHERE created_at >= now() - interval '60 days'
  `);
  const r = rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    activeNow: n("active_now"),
    dauToday: n("dau_today"),
    dauYesterday: n("dau_yesterday"),
    wauCurrent: n("wau_current"),
    wauPrevious: n("wau_previous"),
    mauCurrent: n("mau_current"),
    mauPrevious: n("mau_previous"),
    activeWindowMinutes: ACTIVE_NOW_WINDOW_MINUTES,
  };
}

/** Postgres date_trunc units + to_char formats matching the client's keys. */
const PG_BUCKET: Record<Granularity, { unit: string; fmt: string }> = {
  // date_trunc('week') is Monday-start, matching the dashboard convention.
  hour: { unit: "hour", fmt: 'YYYY-MM-DD"T"HH24' },
  day: { unit: "day", fmt: "YYYY-MM-DD" },
  week: { unit: "week", fmt: "YYYY-MM-DD" },
  month: { unit: "month", fmt: "YYYY-MM" },
};

/** Distinct signed-in users per bucket, gap-filled to `count` buckets. */
export async function fetchActiveUserSeries(
  granularity: Granularity,
  count: number
): Promise<SeriesPoint[]> {
  const n = intOrThrow(count);
  const { unit, fmt } = PG_BUCKET[granularity];
  const rows = await prisma.$queryRawUnsafe<
    { bucket: string; value: bigint | number }[]
  >(`
    SELECT to_char(date_trunc('${unit}', created_at), '${fmt}') AS bucket,
           count(DISTINCT user_id) AS value
    FROM auth.refresh_tokens
    WHERE created_at >= date_trunc('${unit}', now())
                        - make_interval(${unit}s => ${n - 1})
    GROUP BY 1 ORDER BY 1
  `);
  const map = new Map<string, number>();
  for (const row of rows) map.set(String(row.bucket), Number(row.value) || 0);
  return fillSeries(map, granularity, n);
}

// ── Conversion: Vercel visitors (denominator) + DB conversions (numerator) ─
// Vercel Web Analytics counts unique visitors per route but cannot identify
// them; the app database knows exactly who signed up but never sees the
// visitors who didn't. Pairing the two gives the standard top-of-funnel
// rate — "signups that day ÷ unique visitors that day" — rather than a
// person-linked funnel. Both sides are counted over the same UTC day.

export interface ConversionPoint extends SeriesPoint {
  visitors: number;
  conversions: number;
}

export interface ConversionWindow {
  visitors: number;
  conversions: number;
  ratePct: number | null;
  prevVisitors: number;
  prevConversions: number;
  prevRatePct: number | null;
}

export const FUNNELS = {
  pricing: {
    path: "/pricing",
    /**
     * Plan-grid visitors who became accounts. Signup is embedded in the
     * pricing page itself, so this is a tight one-step funnel; chain it with
     * the signup → paid rate for the end-to-end number.
     */
    numerator: "signups" as const,
  },
  vip: {
    path: "/vip",
    /** VIP offer viewers who bought the lifetime deal. */
    numerator: "vip_subs" as const,
  },
};

export type FunnelKind = keyof typeof FUNNELS;

const ratePct = (c: number, v: number) => (v > 0 ? (c / v) * 100 : null);

/** UTC day key — matches the day buckets Vercel returns. */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Conversion events per UTC day for a funnel's numerator. */
async function conversionsByDay(
  kind: FunnelKind,
  since: Date
): Promise<Map<string, number>> {
  const dates =
    FUNNELS[kind].numerator === "signups"
      ? (
          await prisma.user.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true },
          })
        ).map((r) => r.createdAt)
      : (
          await prisma.subscription.findMany({
            // The /vip page sells the $11.99-forever lifetime deal; that is
            // the source tag its checkout writes.
            where: {
              createdAt: { gte: since },
              acquisitionSource: "vip-lifetime",
            },
            select: { createdAt: true },
          })
        ).map((r) => r.createdAt);

  const map = new Map<string, number>();
  for (const d of dates) {
    const k = utcDayKey(d);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/**
 * Daily conversion series plus current-vs-previous window totals. Fetches
 * 2×`days` so the previous window is the same length; the returned series
 * covers only the current window.
 */
export async function fetchConversion(
  kind: FunnelKind,
  days: number
): Promise<{ window: ConversionWindow; series: ConversionPoint[] }> {
  const n = intOrThrow(days);
  const visitorRows = await fetchDailyVisitors(FUNNELS[kind].path, n * 2);
  const since = new Date(Date.now() - 2 * n * 86_400_000);
  const conversions = await conversionsByDay(kind, since);

  const visitorsByDay = new Map<string, number>();
  for (const v of visitorRows) {
    visitorsByDay.set(v.timestamp.slice(0, 10), v.visitors);
  }

  // Build the axis from calendar days so a day Vercel omits (zero traffic)
  // still appears, and the current/previous split is exact.
  const today = new Date();
  const dayAt = (offset: number) =>
    utcDayKey(new Date(today.getTime() - offset * 86_400_000));

  const point = (key: string): ConversionPoint => {
    const visitors = visitorsByDay.get(key) ?? 0;
    const converted = conversions.get(key) ?? 0;
    return {
      date: key,
      value: ratePct(converted, visitors),
      visitors,
      conversions: converted,
    };
  };

  const current: ConversionPoint[] = [];
  for (let i = n - 1; i >= 0; i--) current.push(point(dayAt(i)));

  const sum = (points: ConversionPoint[], pick: (p: ConversionPoint) => number) =>
    points.reduce((s, p) => s + pick(p), 0);
  const previous: ConversionPoint[] = [];
  for (let i = 2 * n - 1; i >= n; i--) previous.push(point(dayAt(i)));

  const visitors = sum(current, (p) => p.visitors);
  const converted = sum(current, (p) => p.conversions);
  const prevVisitors = sum(previous, (p) => p.visitors);
  const prevConversions = sum(previous, (p) => p.conversions);

  return {
    window: {
      visitors,
      conversions: converted,
      ratePct: ratePct(converted, visitors),
      prevVisitors,
      prevConversions,
      prevRatePct: ratePct(prevConversions, prevVisitors),
    },
    series: current,
  };
}

// ── Signup → paid conversion (database only) ──────────────────────────────
// A signup cohort's conversion rate: of the accounts created in a period,
// how many started a subscription. Both sides are rows we own, so unlike the
// pricing/VIP rates this needs no visitor data and always works.
//
// What it actually measures: signup is embedded in the checkout flow (the
// standalone /signup page draws almost no traffic), so an account is
// typically created mid-purchase. Audited against production 2026-09-03:
// 232 of 247 conversions in the 30-day cohort landed within TEN MINUTES of
// registration, 240 within an hour, only 3 after a day. So this is close to
// a checkout-completion rate, not a measure of nurturing casual signups —
// stated in the drill-down so nobody reads it as the latter.
//
// A consequence worth noting: because conversion is near-immediate, cohorts
// are effectively final within the hour, so recent buckets are NOT
// meaningfully censored. Weekly bucketing is purely for volume smoothing.

/** Signup-cohort conversion for the last `days`, vs the `days` before. */
export async function fetchSignupConversion(
  days: number
): Promise<ConversionWindow> {
  const n = intOrThrow(days);
  const now = Date.now();
  const curStart = new Date(now - n * 86_400_000);
  const prevStart = new Date(now - 2 * n * 86_400_000);
  const [visitors, conversions, prevVisitors, prevConversions] =
    await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: curStart } } }),
      prisma.user.count({
        where: { createdAt: { gte: curStart }, subscription: { isNot: null } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: prevStart, lt: curStart } },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: prevStart, lt: curStart },
          subscription: { isNot: null },
        },
      }),
    ]);
  return {
    visitors,
    conversions,
    ratePct: ratePct(conversions, visitors),
    prevVisitors,
    prevConversions,
    prevRatePct: ratePct(prevConversions, prevVisitors),
  };
}

/** Weekly signup cohorts. `weeks = null` means every week on record. */
export async function fetchSignupConversionSeries(
  weeks: number | null
): Promise<ConversionPoint[]> {
  const start =
    weeks == null
      ? new Date(0)
      : stepBack(currentBucketStart("week"), "week", intOrThrow(weeks) - 1);

  // Hundreds of rows — bucket in JS so the cohort rule stays in one place.
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true, subscription: { select: { id: true } } },
  });

  const totals = new Map<string, { visitors: number; conversions: number }>();
  for (const u of users) {
    const k = keyOf(u.createdAt, "week");
    const bucket = totals.get(k) ?? { visitors: 0, conversions: 0 };
    bucket.visitors += 1;
    if (u.subscription) bucket.conversions += 1;
    totals.set(k, bucket);
  }

  const end = currentBucketStart("week");
  let cursor =
    weeks == null
      ? totals.size
        ? parseKey(Array.from(totals.keys()).sort()[0], "week")
        : end
      : stepBack(end, "week", weeks - 1);

  const series: ConversionPoint[] = [];
  while (cursor <= end && series.length < 600) {
    const key = keyOf(cursor, "week");
    const t = totals.get(key) ?? { visitors: 0, conversions: 0 };
    series.push({
      date: key,
      value: ratePct(t.conversions, t.visitors),
      visitors: t.visitors,
      conversions: t.conversions,
    });
    cursor = step(cursor, "week");
  }
  return series;
}

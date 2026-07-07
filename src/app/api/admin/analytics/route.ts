import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  computePayoutCents,
  resolveCentsPerCredit,
} from "@/lib/payoutMath";

/**
 * GET /api/admin/analytics?range=7d|30d|90d|all — platform analytics (ADMIN only)
 *
 * Returns for each KPI: the current-window value, the previous-equal-window
 * value (null when range=all — there is no "previous all time"), and a
 * gap-filled bucketed series for sparklines/charts. Current/previous are
 * equal ELAPSED windows ending now (rolling N days); series buckets stay
 * day-aligned. Buckets are daily for 7d/30d/90d; for "all" they are weekly
 * (short history) or monthly so the point count stays bounded.
 *
 * Conventions (matching payoutMath/payouts):
 * - Royalties = GROSS payout amounts (amountUsdCents) on PAID payouts by paidAt.
 * - Creator earnings = credits spent on their catalog × effective
 *   cents-per-credit rate (customPayoutRate ?? PlatformSetting.creatorPayoutRate).
 * - Credits granted = positive CreditTransactions of type
 *   SUBSCRIPTION / PURCHASE / UPGRADE_TOPUP.
 * - "Today" boundaries use server-local midnight.
 */

type RangeKey = "7d" | "30d" | "90d" | "all";
type Bucket = "day" | "week" | "month";

interface SeriesPoint {
  date: string;
  /** null = "no data" for ratio series (e.g. utilization buckets with no grants). */
  value: number | null;
}

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local-time day key (YYYY-MM-DD) — keeps buckets aligned with the local-midnight "today" snapshot. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function bucketKeyFor(d: Date, bucket: Bucket): string {
  if (bucket === "month") {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  if (bucket === "week") {
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday-start weeks
    return dayKey(monday);
  }
  return dayKey(d);
}

/** Every bucket key from start..end inclusive, so series are gap-filled with zeros. */
function buildBucketKeys(start: Date, end: Date, bucket: Bucket): string[] {
  const keys: string[] = [];
  const cur = startOfDay(start);
  if (bucket === "week") {
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  } else if (bucket === "month") {
    cur.setDate(1);
  }
  while (cur <= end && keys.length < 400) {
    keys.push(bucketKeyFor(cur, bucket));
    if (bucket === "day") cur.setDate(cur.getDate() + 1);
    else if (bucket === "week") cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

function sumSeries(
  rows: { at: Date; value: number }[],
  keys: string[],
  bucket: Bucket
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = bucketKeyFor(r.at, bucket);
    map.set(k, (map.get(k) ?? 0) + r.value);
  }
  return keys.map((k) => ({ date: k, value: map.get(k) ?? 0 }));
}

function distinctSeries(
  rows: { at: Date; id: string }[],
  keys: string[],
  bucket: Bucket
): SeriesPoint[] {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = bucketKeyFor(r.at, bucket);
    let set = map.get(k);
    if (!set) {
      set = new Set();
      map.set(k, set);
    }
    set.add(r.id);
  }
  return keys.map((k) => ({ date: k, value: map.get(k)?.size ?? 0 }));
}

/** Median of an ascending-sorted array; null when empty. */
function median(sortedAsc: number[]): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

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
    const rangeParam = searchParams.get("range") || "30d";
    if (!["7d", "30d", "90d", "all"].includes(rangeParam)) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }
    const range = rangeParam as RangeKey;

    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = addDays(todayStart, -1);

    // Window boundaries. Series buckets stay day-aligned: [currentStart
    // (local midnight), now]. KPI current/previous values compare equal
    // ELAPSED windows ending now — current [now - N days, now] vs previous
    // [now - 2N days, now - N days) — because comparing a partially elapsed
    // day-aligned window against a full previous one shows a spurious
    // negative delta every morning. "all" has no previous.
    let currentStart: Date;
    let deltaCurrentStart: Date;
    let deltaPrevStart: Date;
    let hasPrev: boolean;
    if (range === "all") {
      const firstUser = await prisma.user.aggregate({ _min: { createdAt: true } });
      currentStart = startOfDay(firstUser._min.createdAt ?? now);
      deltaCurrentStart = currentStart;
      deltaPrevStart = currentStart;
      hasPrev = false;
    } else {
      const windowDays = RANGE_DAYS[range];
      currentStart = addDays(todayStart, -(windowDays - 1));
      deltaCurrentStart = addDays(now, -windowDays);
      deltaPrevStart = addDays(now, -2 * windowDays);
      hasPrev = true;
    }

    const spanDays = Math.ceil(
      (now.getTime() - currentStart.getTime()) / 86_400_000
    );
    const bucket: Bucket =
      range === "all" ? (spanDays <= 200 ? "week" : "month") : "day";
    const bucketKeys = buildBucketKeys(currentStart, now, bucket);

    const fetchStart = deltaPrevStart; // covers both delta windows and the series in one query

    const [
      purchases,
      grants,
      paidPayouts,
      uploadedSamples,
      uploadedPresets,
      approvedApps,
      usedInvites,
      activeSubscribers,
      outstandingAgg,
      totalPublishedSamples,
      creatorCount,
      subscriberBalanceAgg,
      settings,
      customRateCreators,
      pendingApplications,
      samplesInReview,
      presetsInReview,
    ] = await Promise.all([
      prisma.purchase.findMany({
        where: { createdAt: { gte: fetchStart } },
        select: {
          createdAt: true,
          creditsSpent: true,
          userId: true,
          sampleId: true,
          presetId: true,
        },
      }),
      prisma.creditTransaction.findMany({
        where: {
          createdAt: { gte: fetchStart },
          amount: { gt: 0 },
          type: { in: ["SUBSCRIPTION", "PURCHASE", "UPGRADE_TOPUP"] },
        },
        select: { createdAt: true, amount: true, type: true, userId: true },
      }),
      prisma.creatorPayout.findMany({
        where: { status: "PAID", paidAt: { gte: fetchStart } },
        select: { paidAt: true, amountUsdCents: true },
      }),
      prisma.sample.findMany({
        where: { createdAt: { gte: fetchStart } },
        select: { createdAt: true, creatorId: true },
      }),
      prisma.preset.findMany({
        where: { createdAt: { gte: fetchStart } },
        select: { createdAt: true, creatorId: true },
      }),
      prisma.creatorApplication.findMany({
        where: { status: "APPROVED", reviewedAt: { gte: fetchStart } },
        select: { userId: true, reviewedAt: true },
      }),
      prisma.creatorInvite.findMany({
        where: { usedAt: { gte: fetchStart } },
        select: { id: true, usedAt: true, usedByUserId: true },
      }),
      prisma.user.count({
        where: { subscriptionStatus: { in: ["active", "past_due"] } },
      }),
      prisma.creditBalance.aggregate({ _sum: { balance: true } }),
      prisma.sample.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count({ where: { role: "CREATOR" } }),
      prisma.creditBalance.aggregate({
        _avg: { balance: true },
        where: { user: { subscriptionStatus: "active" } },
      }),
      prisma.platformSetting.findFirst({ select: { creatorPayoutRate: true } }),
      prisma.user.findMany({
        where: { customPayoutRate: { not: null } },
        select: { id: true, customPayoutRate: true },
      }),
      prisma.creatorApplication.count({ where: { status: "PENDING" } }),
      prisma.sample.count({ where: { status: "REVIEW" } }),
      prisma.preset.count({ where: { status: "REVIEW" } }),
    ]);

    // Map purchased items back to their creators (both windows, one lookup).
    const purchasedSampleIds = Array.from(
      new Set(purchases.map((p) => p.sampleId).filter((id): id is string => id != null))
    );
    const purchasedPresetIds = Array.from(
      new Set(purchases.map((p) => p.presetId).filter((id): id is string => id != null))
    );
    const [purchasedSamples, purchasedPresets] = await Promise.all([
      purchasedSampleIds.length
        ? prisma.sample.findMany({
            where: { id: { in: purchasedSampleIds } },
            select: { id: true, creatorId: true },
          })
        : Promise.resolve([]),
      purchasedPresetIds.length
        ? prisma.preset.findMany({
            where: { id: { in: purchasedPresetIds } },
            select: { id: true, creatorId: true },
          })
        : Promise.resolve([]),
    ]);
    const itemCreator = new Map<string, string>();
    for (const s of purchasedSamples) itemCreator.set(s.id, s.creatorId);
    for (const p of purchasedPresets) itemCreator.set(p.id, p.creatorId);
    const creatorOf = (p: { sampleId: string | null; presetId: string | null }) =>
      (p.sampleId && itemCreator.get(p.sampleId)) ||
      (p.presetId && itemCreator.get(p.presetId)) ||
      null;

    // Split rows into current / previous delta windows. Rows in the current
    // window but before the first series bucket (the partial day at the front
    // of the rolling window) map to keys outside bucketKeys and are dropped
    // from the series, so series stay day-aligned.
    const inCurrent = (d: Date) => d >= deltaCurrentStart;
    const curPurchases = purchases.filter((p) => inCurrent(p.createdAt));
    const prevPurchases = hasPrev
      ? purchases.filter((p) => !inCurrent(p.createdAt))
      : [];
    const curGrants = grants.filter((g) => inCurrent(g.createdAt));
    const prevGrants = hasPrev ? grants.filter((g) => !inCurrent(g.createdAt)) : [];
    const curPayouts = paidPayouts.filter((p) => p.paidAt && inCurrent(p.paidAt));
    const prevPayouts = hasPrev
      ? paidPayouts.filter((p) => p.paidAt && !inCurrent(p.paidAt))
      : [];
    const curUploads = uploadedSamples.filter((s) => inCurrent(s.createdAt));
    const prevUploads = hasPrev
      ? uploadedSamples.filter((s) => !inCurrent(s.createdAt))
      : [];
    const curPresetUploads = uploadedPresets.filter((p) => inCurrent(p.createdAt));
    const prevPresetUploads = hasPrev
      ? uploadedPresets.filter((p) => !inCurrent(p.createdAt))
      : [];

    // ── Marketplace ────────────────────────────
    const creditsRedeemedCur = curPurchases.reduce((s, p) => s + p.creditsSpent, 0);
    const creditsRedeemedPrev = prevPurchases.reduce((s, p) => s + p.creditsSpent, 0);
    const creditsGrantedCur = curGrants.reduce((s, g) => s + g.amount, 0);
    const creditsGrantedPrev = prevGrants.reduce((s, g) => s + g.amount, 0);
    const utilizationCur =
      creditsGrantedCur > 0 ? (creditsRedeemedCur / creditsGrantedCur) * 100 : null;
    const utilizationPrev =
      hasPrev && creditsGrantedPrev > 0
        ? (creditsRedeemedPrev / creditsGrantedPrev) * 100
        : null;

    const redeemedByBucket = new Map<string, number>();
    for (const p of curPurchases) {
      const k = bucketKeyFor(p.createdAt, bucket);
      redeemedByBucket.set(k, (redeemedByBucket.get(k) ?? 0) + p.creditsSpent);
    }
    const grantedByBucket = new Map<string, number>();
    for (const g of curGrants) {
      const k = bucketKeyFor(g.createdAt, bucket);
      grantedByBucket.set(k, (grantedByBucket.get(k) ?? 0) + g.amount);
    }
    const utilizationSeries: SeriesPoint[] = bucketKeys.map((k) => {
      const granted = grantedByBucket.get(k) ?? 0;
      const redeemed = redeemedByBucket.get(k) ?? 0;
      // Grants are lumpy: null (chart gap) — not 0% — when nothing was
      // granted in a bucket, even if credits were redeemed.
      return { date: k, value: granted > 0 ? (redeemed / granted) * 100 : null };
    });

    const royaltiesCurCents = curPayouts.reduce((s, p) => s + p.amountUsdCents, 0);
    const royaltiesPrevCents = prevPayouts.reduce((s, p) => s + p.amountUsdCents, 0);
    const royaltiesSeries = sumSeries(
      curPayouts.map((p) => ({ at: p.paidAt as Date, value: p.amountUsdCents / 100 })),
      bucketKeys,
      bucket
    );

    const purchasesSeries = sumSeries(
      curPurchases.map((p) => ({ at: p.createdAt, value: 1 })),
      bucketKeys,
      bucket
    );

    // ── Content ────────────────────────────────
    const uploadsSeries = sumSeries(
      curUploads.map((s) => ({ at: s.createdAt, value: 1 })),
      bucketKeys,
      bucket
    );
    const curSamplePurchases = curPurchases.filter((p) => p.sampleId != null);
    const distinctPurchasedSamples = new Set(
      curSamplePurchases.map((p) => p.sampleId as string)
    ).size;
    // "Average purchases per sample" = sample purchases in range / distinct
    // samples that sold in range (labeled as such in the UI).
    const avgPurchasesPerPurchasedSample =
      distinctPurchasedSamples > 0
        ? curSamplePurchases.length / distinctPurchasedSamples
        : null;

    // ── Creators ───────────────────────────────
    // Active = distinct creators with ≥1 sale of their content OR ≥1 upload in window.
    const sellersCur = new Set<string>();
    for (const p of curPurchases) {
      const c = creatorOf(p);
      if (c) sellersCur.add(c);
    }
    const sellersPrev = new Set<string>();
    for (const p of prevPurchases) {
      const c = creatorOf(p);
      if (c) sellersPrev.add(c);
    }
    const activeCreatorsCurSet = new Set(sellersCur);
    for (const u of curUploads) activeCreatorsCurSet.add(u.creatorId);
    for (const u of curPresetUploads) activeCreatorsCurSet.add(u.creatorId);
    const activeCreatorsPrevSet = new Set(sellersPrev);
    for (const u of prevUploads) activeCreatorsPrevSet.add(u.creatorId);
    for (const u of prevPresetUploads) activeCreatorsPrevSet.add(u.creatorId);

    const activeCreatorEvents: { at: Date; id: string }[] = [];
    for (const p of curPurchases) {
      const c = creatorOf(p);
      if (c) activeCreatorEvents.push({ at: p.createdAt, id: c });
    }
    for (const u of curUploads) activeCreatorEvents.push({ at: u.createdAt, id: u.creatorId });
    for (const u of curPresetUploads) activeCreatorEvents.push({ at: u.createdAt, id: u.creatorId });
    const activeCreatorsSeries = distinctSeries(activeCreatorEvents, bucketKeys, bucket);

    // New creators = approved application (by reviewedAt) or used invite (by
    // usedAt), deduped per user keeping the earliest of the two dates.
    const newCreatorDates = new Map<string, Date>();
    for (const a of approvedApps) {
      if (!a.reviewedAt) continue;
      const existing = newCreatorDates.get(a.userId);
      if (!existing || a.reviewedAt < existing) newCreatorDates.set(a.userId, a.reviewedAt);
    }
    for (const inv of usedInvites) {
      if (!inv.usedAt) continue;
      const key = inv.usedByUserId ?? `invite:${inv.id}`;
      const existing = newCreatorDates.get(key);
      if (!existing || inv.usedAt < existing) newCreatorDates.set(key, inv.usedAt);
    }
    const newCreatorEntries = Array.from(newCreatorDates.entries());
    const newCreatorsCur = newCreatorEntries.filter(([, d]) => inCurrent(d)).length;
    const newCreatorsPrev = hasPrev
      ? newCreatorEntries.filter(([, d]) => !inCurrent(d)).length
      : null;
    const newCreatorsSeries = distinctSeries(
      newCreatorEntries
        .filter(([, d]) => inCurrent(d))
        .map(([id, d]) => ({ at: d, id })),
      bucketKeys,
      bucket
    );

    // ── Creator economy (current window only) ──
    const creditsByCreator = new Map<string, number>();
    for (const p of curPurchases) {
      const c = creatorOf(p);
      if (!c) continue;
      creditsByCreator.set(c, (creditsByCreator.get(c) ?? 0) + p.creditsSpent);
    }
    const platformRate = settings?.creatorPayoutRate ?? null;
    const customRate = new Map<string, number | null>(
      customRateCreators.map((c) => [c.id, c.customPayoutRate])
    );
    const earningsCents = Array.from(creditsByCreator.entries()).map(
      ([creatorId, credits]) =>
        computePayoutCents(
          credits,
          resolveCentsPerCredit(customRate.get(creatorId), platformRate)
        )
    );
    const earningsAsc = [...earningsCents].sort((a, b) => a - b);
    const earningsDesc = [...earningsCents].sort((a, b) => b - a);
    const totalEarningsCents = earningsCents.reduce((s, v) => s + v, 0);
    const creatorsWithSale = creditsByCreator.size;
    const medianCents = median(earningsAsc);

    // ── Subscriber health ──────────────────────
    const upgradeUsersCur = new Set(
      curGrants.filter((g) => g.type === "UPGRADE_TOPUP").map((g) => g.userId)
    ).size;
    const upgradeRatePct =
      activeSubscribers > 0 ? (upgradeUsersCur / activeSubscribers) * 100 : null;
    const avgCreditsRemaining = subscriberBalanceAgg._avg.balance;

    // Active-subscriber count is point-in-time (no history table), so the
    // sparkline/delta use an honest proxy: distinct users receiving
    // SUBSCRIPTION credit grants (renewals) per bucket — labeled in the UI.
    const renewalRows = curGrants
      .filter((g) => g.type === "SUBSCRIPTION")
      .map((g) => ({ at: g.createdAt, id: g.userId }));
    const renewalsSeries = distinctSeries(renewalRows, bucketKeys, bucket);
    const renewalsCur = new Set(renewalRows.map((r) => r.id)).size;
    const renewalsPrev = hasPrev
      ? new Set(
          prevGrants.filter((g) => g.type === "SUBSCRIPTION").map((g) => g.userId)
        ).size
      : null;

    // ── Today snapshot (server-local midnight) ─
    const isToday = (d: Date) => d >= todayStart;
    const isYesterday = (d: Date) => d >= yesterdayStart && d < todayStart;
    const todayPurchases = purchases.filter((p) => isToday(p.createdAt));
    const yesterdayPurchases = purchases.filter((p) => isYesterday(p.createdAt));
    const today = {
      samplesPurchased: {
        today: todayPurchases.length,
        yesterday: yesterdayPurchases.length,
      },
      royaltiesPaidUsd: {
        today: centsToUsd(
          paidPayouts
            .filter((p) => p.paidAt && isToday(p.paidAt))
            .reduce((s, p) => s + p.amountUsdCents, 0)
        ),
        yesterday: centsToUsd(
          paidPayouts
            .filter((p) => p.paidAt && isYesterday(p.paidAt))
            .reduce((s, p) => s + p.amountUsdCents, 0)
        ),
      },
      activeBuyers: {
        today: new Set(todayPurchases.map((p) => p.userId)).size,
        yesterday: new Set(yesterdayPurchases.map((p) => p.userId)).size,
      },
      creditsRedeemed: {
        today: todayPurchases.reduce((s, p) => s + p.creditsSpent, 0),
        yesterday: yesterdayPurchases.reduce((s, p) => s + p.creditsSpent, 0),
      },
      samplesUploaded: {
        today: uploadedSamples.filter((s) => isToday(s.createdAt)).length,
        yesterday: uploadedSamples.filter((s) => isYesterday(s.createdAt)).length,
      },
    };

    return NextResponse.json({
      range,
      bucket,
      rangeStart: currentStart.toISOString(),
      rangeEnd: now.toISOString(),
      // Server-local day keys matching the series bucket-key convention, so
      // the client can render range labels that agree with chart labels
      // regardless of the viewer's timezone.
      rangeStartDay: dayKey(currentStart),
      rangeEndDay: dayKey(now),
      previous: hasPrev
        ? {
            start: deltaPrevStart.toISOString(),
            end: deltaCurrentStart.toISOString(),
          }
        : null,
      kpis: {
        activeSubscribers: {
          current: activeSubscribers,
          previous: null, // point-in-time count — no historical baseline
          series: renewalsSeries,
          renewals: { current: renewalsCur, previous: renewalsPrev },
        },
        // Counts every marketplace purchase (samples + presets) — surfaced
        // as "Items Purchased" in the UI. Same for marketplace and today
        // snapshot below; only avgPurchasesPerPurchasedSample is samples-only.
        samplesPurchased: {
          current: curPurchases.length,
          previous: hasPrev ? prevPurchases.length : null,
          series: purchasesSeries,
        },
        creditUtilization: {
          current: utilizationCur,
          previous: utilizationPrev,
          series: utilizationSeries,
        },
        royaltiesPaidUsd: {
          current: centsToUsd(royaltiesCurCents),
          previous: hasPrev ? centsToUsd(royaltiesPrevCents) : null,
          series: royaltiesSeries,
        },
        activeCreators: {
          current: activeCreatorsCurSet.size,
          previous: hasPrev ? activeCreatorsPrevSet.size : null,
          series: activeCreatorsSeries,
        },
        newCreators: {
          current: newCreatorsCur,
          previous: newCreatorsPrev,
          series: newCreatorsSeries,
        },
      },
      marketplace: {
        samplesPurchased: curPurchases.length,
        creditsRedeemed: creditsRedeemedCur,
        creditsGranted: creditsGrantedCur,
        creditUtilizationPct: utilizationCur,
        royaltiesPaidUsd: centsToUsd(royaltiesCurCents),
        creditsOutstanding: outstandingAgg._sum.balance ?? 0,
        purchasesSeries,
      },
      content: {
        newSamples: curUploads.length,
        newSamplesPrevious: hasPrev ? prevUploads.length : null,
        totalPublishedSamples,
        avgPurchasesPerPurchasedSample,
        uploadsSeries,
      },
      creatorEconomy: {
        creatorCount,
        creatorsWithSale,
        creatorsWithSalePct:
          creatorCount > 0 ? (creatorsWithSale / creatorCount) * 100 : null,
        avgEarningsUsd:
          creatorsWithSale > 0
            ? centsToUsd(totalEarningsCents / creatorsWithSale)
            : null,
        medianEarningsUsd: medianCents != null ? centsToUsd(medianCents) : null,
        topEarningsUsd:
          earningsDesc.length > 0 ? centsToUsd(earningsDesc[0]) : null,
        top10EarningsUsd:
          earningsDesc.length > 0
            ? centsToUsd(earningsDesc.slice(0, 10).reduce((s, v) => s + v, 0))
            : null,
      },
      subscriberHealth: {
        activeSubscribers,
        upgradeUsers: upgradeUsersCur,
        upgradeRatePct,
        avgCreditsRemaining,
      },
      today,
      actionItems: {
        pendingApplications,
        samplesInReview,
        presetsInReview,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

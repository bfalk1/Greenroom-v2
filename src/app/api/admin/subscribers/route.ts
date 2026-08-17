import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  COHORT_LABEL,
  VIP_FIRST_MONTH_CENTS,
  cohortOf,
  monthlyUnitCents,
  type SubCohort,
} from "@/lib/mrr";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/subscribers — subscriber counts and tier mix (ADMIN only)
 *
 * Query: ?status=active|canceling|expired|comped&tierId=<uuid>&q=<search>
 *        &limit=<1-200>&offset=<n>
 *
 * The headline counts always describe the whole platform; status/tierId/q only
 * filter the paginated list underneath them.
 *
 * Definitions match GET /api/admin/analytics so the two dashboards never
 * disagree:
 * - Active   = a provider-backed subscriptions row not past currentPeriodEnd.
 * - Comped   = users.subscription_status active/past_due with NO subscriptions
 *              row (the beta bypass). These have no tier and pay nothing.
 * - Expired  = a subscriptions row already past currentPeriodEnd.
 *
 * Every active sub is classified into one of four mutually-exclusive cohorts by
 * cohortOf() in @/lib/mrr — list / lifetime / promo / annual — and priced by
 * monthlyUnitCents(), the same rules computeMrrSnapshot uses, so this dashboard
 * and the MRR snapshot never disagree:
 * - lifetime = acquisition_source "vip-lifetime": the locked $11.99 discount.
 * - annual   = a period spanning ~a year: yearly charge ÷ 12.
 * - promo    = acquisition_source "vip-first-month": priced at LIST, because
 *              the $5.99 coupon is duration-"once" and renews at full price.
 * Other one-off coupons aren't tracked and also report at list.
 */

const STATUSES = ["active", "canceling", "expired", "comped"] as const;
type Status = (typeof STATUSES)[number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/** Best display name for a subscriber row. */
function displayName(u: {
  artistName: string | null;
  fullName: string | null;
  username: string | null;
  email: string;
}): string {
  return u.artistName || u.fullName || u.username || u.email;
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

    const statusParam = searchParams.get("status") || "active";
    if (!STATUSES.includes(statusParam as Status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const status = statusParam as Status;

    const tierId = searchParams.get("tierId") || null;
    const q = (searchParams.get("q") || "").trim();

    const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
        : DEFAULT_LIMIT;
    const offsetRaw = Number(searchParams.get("offset") ?? 0);
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

    const now = new Date();
    const since = (days: number) =>
      new Date(now.getTime() - days * 86_400_000);

    // A subscriptions row only counts as real billing if a provider actually
    // backs it — same guard the analytics route uses.
    const providerBacked: Prisma.SubscriptionWhereInput = {
      OR: [
        { stripeSubscriptionId: { not: null } },
        { paypalSubscriptionId: { not: null } },
      ],
    };
    const activeWhere: Prisma.SubscriptionWhereInput = {
      currentPeriodEnd: { gte: now },
      ...providerBacked,
    };
    const compedWhere: Prisma.UserWhereInput = {
      subscriptionStatus: { in: ["active", "past_due"] },
      subscription: { is: null },
    };
    // Cohort membership can't be expressed as a groupBy: "annual" is a span
    // between two columns, which needs arithmetic Prisma's where can't do. So
    // the active set is read row-by-row (a handful of small columns, bounded by
    // the paying-subscriber count) and bucketed in one pass below — the same
    // shape computeMrrSnapshot already uses.
    const cohortSelect = {
      tierId: true,
      provider: true,
      cancelAtPeriodEnd: true,
      acquisitionSource: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      createdAt: true,
    } as const;

    const [
      tierRows,
      activeSubs,
      recentSubs,
      expiredTotal,
      compedTotal,
    ] = await Promise.all([
      prisma.subscriptionTier.findMany({
        select: {
          id: true,
          name: true,
          displayName: true,
          priceUsdCents: true,
          creditsPerMonth: true,
          isActive: true,
        },
        orderBy: { priceUsdCents: "asc" },
      }),
      prisma.subscription.findMany({
        where: activeWhere,
        select: cohortSelect,
      }),
      // New-signup windows count every sub STARTED in the window, whether or
      // not it's still active — a promo sub that already lapsed was still a
      // signup. 30d covers the widest window; 24h/7d are sliced from it.
      prisma.subscription.findMany({
        where: { ...providerBacked, createdAt: { gte: since(30) } },
        select: cohortSelect,
      }),
      prisma.subscription.count({
        where: { currentPeriodEnd: { lt: now }, ...providerBacked },
      }),
      prisma.user.count({ where: compedWhere }),
    ]);

    const activeTotal = activeSubs.length;
    const cancelingTotal = activeSubs.filter((s) => s.cancelAtPeriodEnd).length;

    // ── Cohort bucketing ───────────────────────
    type CohortBucket = {
      active: number;
      canceling: number;
      stripe: number;
      paypal: number;
      mrrCents: number;
      /** Monthly-equivalent price one sub in this bucket bills. */
      unitCents: number;
    };
    const emptyBucket = (unitCents: number): CohortBucket => ({
      active: 0,
      canceling: 0,
      stripe: 0,
      paypal: 0,
      mrrCents: 0,
      unitCents,
    });

    const tierById = new Map(tierRows.map((t) => [t.id, t]));
    /** tierId → cohort → bucket. Tiers with no subs never get an entry. */
    const bucketsByTier = new Map<string, Map<SubCohort, CohortBucket>>();
    const cohortTotals = new Map<SubCohort, number>();
    const acquisitionCounts = new Map<string, number>();

    for (const sub of activeSubs) {
      const tier = tierById.get(sub.tierId);
      const cohort = cohortOf(sub);
      cohortTotals.set(cohort, (cohortTotals.get(cohort) ?? 0) + 1);
      const source = sub.acquisitionSource ?? "direct";
      acquisitionCounts.set(source, (acquisitionCounts.get(source) ?? 0) + 1);
      if (!tier) continue; // counted in untieredActive below

      let byCohort = bucketsByTier.get(sub.tierId);
      if (!byCohort) {
        byCohort = new Map();
        bucketsByTier.set(sub.tierId, byCohort);
      }
      const unitCents = monthlyUnitCents(cohort, tier);
      const bucket = byCohort.get(cohort) ?? emptyBucket(unitCents);
      bucket.active++;
      bucket.mrrCents += unitCents;
      if (sub.cancelAtPeriodEnd) bucket.canceling++;
      if (sub.provider === "paypal") bucket.paypal++;
      else bucket.stripe++;
      byCohort.set(cohort, bucket);
    }

    // Cohorts render top-to-bottom in this order under their tier.
    const COHORT_ORDER: SubCohort[] = ["list", "annual", "promo", "lifetime"];

    // Accumulate money in cents so the totals stay exact.
    let mrrCentsTotal = 0;
    let listMrrCentsTotal = 0;
    let monthlyCreditsTotal = 0;

    const tiers = tierRows.map((t) => {
      const byCohort = bucketsByTier.get(t.id) ?? new Map<SubCohort, CohortBucket>();
      const cohorts = COHORT_ORDER.filter((c) => byCohort.has(c)).map((c) => {
        const b = byCohort.get(c)!;
        return {
          key: c,
          label: COHORT_LABEL[c],
          active: b.active,
          canceling: b.canceling,
          stripe: b.stripe,
          paypal: b.paypal,
          /** Monthly-equivalent price per sub — annual is the yearly ÷ 12. */
          unitPriceUsd: centsToUsd(b.unitCents),
          mrrUsd: centsToUsd(b.mrrCents),
        };
      });

      const sum = (pick: (b: CohortBucket) => number) =>
        [...byCohort.values()].reduce((s, b) => s + pick(b), 0);
      const active = sum((b) => b.active);
      const mrrCents = sum((b) => b.mrrCents);
      const listMrrCents = active * t.priceUsdCents;

      mrrCentsTotal += mrrCents;
      listMrrCentsTotal += listMrrCents;
      monthlyCreditsTotal += active * t.creditsPerMonth;

      return {
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        priceUsd: centsToUsd(t.priceUsdCents),
        creditsPerMonth: t.creditsPerMonth,
        isActive: t.isActive,
        active,
        canceling: sum((b) => b.canceling),
        sharePct: activeTotal > 0 ? (active / activeTotal) * 100 : null,
        /** Effective MRR: each cohort at the price it actually bills. */
        mrrUsd: centsToUsd(mrrCents),
        /** What this tier would bill if every sub paid monthly list price. */
        listMrrUsd: centsToUsd(listMrrCents),
        stripe: sum((b) => b.stripe),
        paypal: sum((b) => b.paypal),
        /** Per-cohort split; one entry per cohort with at least one sub. */
        cohorts,
      };
    });

    // ── New signups, by cohort ─────────────────
    const WINDOWS = [
      { key: "last24h" as const, days: 1 },
      { key: "last7d" as const, days: 7 },
      { key: "last30d" as const, days: 30 },
    ];
    const newTotals = { last24h: 0, last7d: 0, last30d: 0 };
    const newByCohort = new Map<SubCohort, typeof newTotals>();
    for (const sub of recentSubs) {
      const cohort = cohortOf(sub);
      const entry =
        newByCohort.get(cohort) ?? { last24h: 0, last7d: 0, last30d: 0 };
      for (const w of WINDOWS) {
        if (sub.createdAt >= since(w.days)) {
          newTotals[w.key]++;
          entry[w.key]++;
        }
      }
      newByCohort.set(cohort, entry);
    }

    // Subs whose tierId no longer resolves to a tier row would silently vanish
    // from the per-tier table while still counting in the total — surface the
    // discrepancy instead.
    const tieredActive = tiers.reduce((s, t) => s + t.active, 0);
    const untieredActive = activeTotal - tieredActive;

    const mrrUsd = centsToUsd(mrrCentsTotal);
    const providerTotals = tiers.reduce(
      (acc, t) => ({ stripe: acc.stripe + t.stripe, paypal: acc.paypal + t.paypal }),
      { stripe: 0, paypal: 0 }
    );

    // ── Paginated list ─────────────────────────
    const userSelect = {
      id: true,
      email: true,
      username: true,
      artistName: true,
      fullName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    } as const;

    const userSearch: Prisma.UserWhereInput | undefined = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
            { artistName: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

    let subscribers: {
      userId: string;
      email: string;
      username: string | null;
      name: string;
      avatarUrl: string | null;
      role: string;
      tierName: string | null;
      tierDisplayName: string | null;
      provider: string | null;
      cancelAtPeriodEnd: boolean;
      acquisitionSource: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      startedAt: string;
    }[];
    let listTotal: number;

    if (status === "comped") {
      // No subscriptions row to join — these come straight off users.
      const where: Prisma.UserWhereInput = {
        ...compedWhere,
        ...(userSearch ?? {}),
      };
      const [rows, count] = await Promise.all([
        prisma.user.findMany({
          where,
          select: userSelect,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.user.count({ where }),
      ]);
      listTotal = count;
      subscribers = rows.map((u) => ({
        userId: u.id,
        email: u.email,
        username: u.username,
        name: displayName(u),
        avatarUrl: u.avatarUrl,
        role: u.role,
        tierName: null,
        tierDisplayName: null,
        provider: null,
        cancelAtPeriodEnd: false,
        acquisitionSource: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        startedAt: u.createdAt.toISOString(),
      }));
    } else {
      const base: Prisma.SubscriptionWhereInput =
        status === "expired"
          ? { currentPeriodEnd: { lt: now }, ...providerBacked }
          : status === "canceling"
          ? { ...activeWhere, cancelAtPeriodEnd: true }
          : activeWhere;
      const where: Prisma.SubscriptionWhereInput = {
        ...base,
        ...(tierId ? { tierId } : {}),
        ...(userSearch ? { user: userSearch } : {}),
      };
      const [rows, count] = await Promise.all([
        prisma.subscription.findMany({
          where,
          select: {
            provider: true,
            cancelAtPeriodEnd: true,
            acquisitionSource: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            createdAt: true,
            tier: { select: { name: true, displayName: true } },
            user: { select: userSelect },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.subscription.count({ where }),
      ]);
      listTotal = count;
      subscribers = rows.map((s) => ({
        userId: s.user.id,
        email: s.user.email,
        username: s.user.username,
        name: displayName(s.user),
        avatarUrl: s.user.avatarUrl,
        role: s.user.role,
        tierName: s.tier?.name ?? null,
        tierDisplayName: s.tier?.displayName ?? null,
        provider: s.provider,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        acquisitionSource: s.acquisitionSource,
        currentPeriodStart: s.currentPeriodStart.toISOString(),
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        startedAt: s.createdAt.toISOString(),
      }));
    }

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totals: {
        active: activeTotal,
        canceling: cancelingTotal,
        expired: expiredTotal,
        comped: compedTotal,
        /** Everyone with access right now, billed or not. */
        withAccess: activeTotal + compedTotal,
        untieredActive,
        /** Effective MRR: every cohort at the price it actually bills. */
        mrrUsd,
        /** MRR if every sub paid monthly list price (the upper-bound figure). */
        listMrrUsd: centsToUsd(listMrrCentsTotal),
        /** Active subs on the VIP lifetime offer. */
        lifetimeActive: cohortTotals.get("lifetime") ?? 0,
        /** Active subs acquired through the $5.99-first-month /promo offer. */
        promoActive: cohortTotals.get("promo") ?? 0,
        /** Active subs on yearly billing (period spans ~a year). */
        annualActive: cohortTotals.get("annual") ?? 0,
        /** What the promo cohort pays for its single discounted cycle. */
        promoFirstMonthUsd: centsToUsd(VIP_FIRST_MONTH_CENTS),
        /** Effective MRR ÷ paying subscribers. */
        avgMrrUsd:
          activeTotal > 0 ? centsToUsd(mrrCentsTotal / activeTotal) : null,
        /** Mean monthly credit allocation per paying subscriber. */
        avgCreditsPerMonth:
          activeTotal > 0 ? monthlyCreditsTotal / activeTotal : null,
        /** Credits granted per month across all paying subscribers. */
        monthlyCreditsTotal,
        stripe: providerTotals.stripe,
        paypal: providerTotals.paypal,
      },
      newSubscribers: {
        ...newTotals,
        /** Same windows, split by cohort — how many of the new signups came
         *  from the promo funnel and how many chose annual billing. */
        cohorts: COHORT_ORDER.filter((c) => newByCohort.has(c)).map((c) => ({
          key: c,
          label: COHORT_LABEL[c],
          ...newByCohort.get(c)!,
        })),
      },
      tiers,
      acquisitionSources: [...acquisitionCounts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      list: {
        status,
        tierId,
        q: q || null,
        limit,
        offset,
        total: listTotal,
        subscribers,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/subscribers error:", error);
    return NextResponse.json(
      { error: "Failed to load subscribers" },
      { status: 500 }
    );
  }
}

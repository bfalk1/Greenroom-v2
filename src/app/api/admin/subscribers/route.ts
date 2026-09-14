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
import { subscriberLifetime } from "@/lib/subscriberLifetime";
import {
  MOVEMENT_WINDOWS,
  PROVIDER_BACKED,
  emptyWindowCounts,
  subscriberMovement,
  subscriberState,
  subscriberStateWhere,
  windowStart,
  type MovementInput,
  type WindowCounts,
} from "@/lib/subscriberStatus";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/subscribers — subscriber counts and tier mix, readable by
 * staff (MODERATOR or ADMIN).
 *
 * Query: ?status=active|canceling|failing|expired|comped&tierId=<uuid>
 *        &q=<search>&limit=<1-200>&offset=<n>
 *
 * The headline counts always describe the whole platform; status/tierId/q only
 * filter the paginated list underneath them.
 *
 * Two parts of the payload are ADMIN-only, and both are withheld here rather
 * than merely hidden in the UI — this is the access control:
 * - **`list` comes back null for a moderator.** Aggregates say how the
 *   business is doing; the roster names individual customers and what they
 *   bought. The query is skipped outright.
 * - **Every dollar figure is nulled and `includesRevenue` is false.**
 *   Moderators see how many subscriptions there are, not what they earn.
 *   Tier list prices go too: price × subscribers is revenue with extra steps.
 *
 * Subscriber states come from @/lib/subscriberStatus, shared with
 * GET /api/admin/analytics and computeMrrSnapshot so no two screens disagree:
 * - Active   = paying: a provider-backed subscriptions row inside its period,
 *              with no failed payment or cancellation on its owner.
 * - Failing  = inside its period, but the renewal charge failed and the
 *              provider is retrying. Not counted as paying.
 * - Expired  = the period ran out, or the provider canceled.
 * - Comped   = users.subscription_status active/past_due with NO subscriptions
 *              row (the beta bypass). These have no tier and pay nothing.
 *
 * Every paying sub is classified into one of four mutually-exclusive cohorts by
 * cohortOf() in @/lib/mrr — list / lifetime / promo / annual — and priced by
 * monthlyUnitCents(), the same rules computeMrrSnapshot uses, so this dashboard
 * and the MRR snapshot never disagree:
 * - lifetime = acquisition_source "vip-lifetime": the locked $11.99 discount.
 * - annual   = a period spanning ~a year: yearly charge ÷ 12.
 * - promo    = acquisition_source "vip-first-month": priced at LIST, because
 *              the $5.99 coupon is duration-"once" and renews at full price.
 * Other one-off coupons aren't tracked and also report at list.
 *
 * `lifetime` is how long subscribers stay (@/lib/subscriberLifetime): observed
 * tenure for paying and ended subs, and the lifetime the last 30 days' churn
 * implies. Counts and days only, so moderators receive it unredacted.
 */

const STATUSES = ["active", "canceling", "failing", "expired", "comped"] as const;
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

/** A roster tab as a subscriptions filter (comped users have no row). */
function rosterWhere(
  status: Exclude<Status, "comped">,
  now: Date
): Prisma.SubscriptionWhereInput {
  switch (status) {
    case "active":
      return subscriberStateWhere("paying", now);
    case "canceling":
      return {
        AND: [subscriberStateWhere("paying", now), { cancelAtPeriodEnd: true }],
      };
    case "failing":
      return subscriberStateWhere("failing", now);
    case "expired":
      return subscriberStateWhere("ended", now);
  }
}

/** The money-bearing parts of the payload — all `withoutRevenue` touches. */
interface RevenueFields {
  totals: {
    mrrUsd: number;
    listMrrUsd: number;
    avgMrrUsd: number | null;
    promoFirstMonthUsd: number;
  };
  tiers: {
    priceUsd: number;
    mrrUsd: number;
    listMrrUsd: number;
    cohorts: { unitPriceUsd: number; mrrUsd: number }[];
  }[];
}

/**
 * Strip every dollar figure from a payload before it reaches a moderator.
 * Nulls rather than deletes, so the client renders one shape and just omits
 * the money tiles/columns when `includesRevenue` is false.
 *
 * Deliberately includes tier/cohort list prices: leaving them in would let
 * anyone multiply price × subscribers back into the MRR this is hiding.
 */
function withoutRevenue<P extends RevenueFields>(payload: P) {
  return {
    ...payload,
    includesRevenue: false as const,
    totals: {
      ...payload.totals,
      mrrUsd: null,
      listMrrUsd: null,
      avgMrrUsd: null,
      promoFirstMonthUsd: null,
    },
    tiers: payload.tiers.map((tier) => ({
      ...tier,
      priceUsd: null,
      mrrUsd: null,
      listMrrUsd: null,
      cohorts: tier.cohorts.map((c) => ({
        ...c,
        unitPriceUsd: null,
        mrrUsd: null,
      })),
    })),
  };
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

    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "MODERATOR")) {
      return NextResponse.json({ error: "Staff access required" }, { status: 403 });
    }

    const isAdmin = dbUser.role === "ADMIN";

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
    const widestWindowStart = windowStart(now, 30);

    const compedWhere: Prisma.UserWhereInput = {
      subscriptionStatus: { in: ["active", "past_due"] },
      subscription: { is: null },
    };
    // Cohort membership can't be expressed as a groupBy: "annual" is a span
    // between two columns, which needs arithmetic Prisma's where can't do. So
    // the rows are read one by one (a handful of small columns, bounded by the
    // subscriptions live in the last 30 days) and bucketed in one pass below —
    // the same shape computeMrrSnapshot already uses.
    const cohortSelect = {
      id: true,
      tierId: true,
      provider: true,
      cancelAtPeriodEnd: true,
      acquisitionSource: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      createdAt: true,
      user: { select: { subscriptionStatus: true } },
    } as const;

    const [tierRows, windowRows, endedRows, compedTotal] = await Promise.all([
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
      // Every sub paying or failing now, plus every one that started or ended
      // in the last 30 days. The headline counts, the movement windows and the
      // new-signup cuts all come from these same rows, so they reconcile.
      prisma.subscription.findMany({
        where: {
          AND: [
            PROVIDER_BACKED,
            {
              OR: [
                { currentPeriodEnd: { gte: widestWindowStart } },
                { createdAt: { gte: widestWindowStart } },
              ],
            },
          ],
        },
        select: cohortSelect,
      }),
      // Every ended sub, however old, for how long subscribers stayed. Only
      // dates come back, and nothing accumulates faster than subs churn.
      prisma.subscription.findMany({
        where: subscriberStateWhere("ended", now),
        select: {
          id: true,
          createdAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          user: { select: { subscriptionStatus: true } },
        },
      }),
      prisma.user.count({ where: compedWhere }),
    ]);
    const expiredTotal = endedRows.length;

    const rows = windowRows.map((row) => ({
      ...row,
      userStatus: row.user.subscriptionStatus,
    }));
    const payingSubs = rows.filter(
      (row) => subscriberState(row, now) === "paying"
    );
    const failingTotal = rows.filter(
      (row) => subscriberState(row, now) === "failing"
    ).length;

    const activeTotal = payingSubs.length;
    const cancelingTotal = payingSubs.filter((s) => s.cancelAtPeriodEnd).length;

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

    for (const sub of payingSubs) {
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

    // ── Movement ───────────────────────────────
    // How Paying moved over 24h / 7d / 30d — new subscriptions in, ended and
    // payment-failed ones out — so the headline reconciles day to day.
    const movement = subscriberMovement(rows, now);

    // ── Lifetime ───────────────────────────────
    // How long subscribers stay. Spans every subscription ever: the live and
    // recent rows above plus every ended one. The two overlap on subs that
    // ended inside the window, so key by id.
    const lifetimeById = new Map<string, MovementInput>();
    for (const row of rows) lifetimeById.set(row.id, row);
    for (const row of endedRows) {
      lifetimeById.set(row.id, {
        ...row,
        userStatus: row.user.subscriptionStatus,
      });
    }
    const lifetime = subscriberLifetime([...lifetimeById.values()], now);

    // ── New signups, by cohort and by tier ─────
    // Two cuts of the same new subscriptions: which OFFER people came in on
    // (standard / annual / promo / lifetime) and which TIER they bought. Each
    // cut sums to movement.started.
    const newByCohort = new Map<SubCohort, WindowCounts>();
    /** Keyed by tierId; null key = a sub whose tier row no longer exists. */
    const newByTier = new Map<string | null, WindowCounts>();
    for (const sub of rows) {
      if (sub.createdAt < widestWindowStart) continue;
      const cohort = cohortOf(sub);
      const cohortEntry = newByCohort.get(cohort) ?? emptyWindowCounts();
      const tierEntry = newByTier.get(sub.tierId) ?? emptyWindowCounts();
      for (const w of MOVEMENT_WINDOWS) {
        if (sub.createdAt >= windowStart(now, w.days)) {
          cohortEntry[w.key]++;
          tierEntry[w.key]++;
        }
      }
      newByCohort.set(cohort, cohortEntry);
      newByTier.set(sub.tierId, tierEntry);
    }

    // Tier rows in the same order as the breakdown table (cheapest first).
    // Signups whose tier row no longer exists collect in a trailing "No tier"
    // row instead of vanishing, so the rows still sum to the windows above.
    const knownTierIds = new Set(tierRows.map((tier) => tier.id));
    const orphanWindows = [...newByTier.entries()]
      .filter(([id]) => id === null || !knownTierIds.has(id))
      .reduce((acc, [, w]) => {
        for (const { key } of MOVEMENT_WINDOWS) acc[key] += w[key];
        return acc;
      }, emptyWindowCounts());
    const newTierRows = [
      ...tierRows
        .filter((tier) => newByTier.has(tier.id))
        .map((tier) => ({
          id: tier.id as string | null,
          name: tier.name,
          label: tier.displayName,
          ...newByTier.get(tier.id)!,
        })),
      ...(orphanWindows.last30d > 0
        ? [{ id: null, name: "—", label: "No tier", ...orphanWindows }]
        : []),
    ];

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

    if (!isAdmin) {
      // Moderator: aggregates only. Don't fetch rows we won't return.
      subscribers = [];
      listTotal = 0;
    } else if (status === "comped") {
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
      // AND, not object spread: the state filter and the search both
      // constrain `user`, and a spread would let one overwrite the other.
      const where: Prisma.SubscriptionWhereInput = {
        AND: [
          rosterWhere(status, now),
          ...(tierId ? [{ tierId }] : []),
          ...(userSearch ? [{ user: userSearch }] : []),
        ],
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

    const payload = {
      generatedAt: now.toISOString(),
      /** False = every *Usd field below is null (moderator view). */
      includesRevenue: true as const,
      totals: {
        active: activeTotal,
        canceling: cancelingTotal,
        /** Inside their period but the renewal charge failed — not in `active`. */
        failing: failingTotal,
        expired: expiredTotal,
        comped: compedTotal,
        /** Everyone the paywall lets in right now, billed or not. Failing subs
         *  keep access while the provider retries. */
        withAccess: activeTotal + failingTotal + compedTotal,
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
        ...movement.started,
        /** Out of Paying per window: the period ran out without renewing, or
         *  the provider canceled. */
        ended: movement.ended,
        /** Out of Paying per window: the renewal charge failed and hasn't
         *  recovered. */
        paymentFailed: movement.paymentFailed,
        /** New − ended − payment failed: how far Paying moved. */
        net: movement.net,
        /** Same windows, split by cohort — how many of the new signups came
         *  from the promo funnel and how many chose annual billing. */
        cohorts: COHORT_ORDER.filter((c) => newByCohort.has(c)).map((c) => ({
          key: c,
          label: COHORT_LABEL[c],
          ...newByCohort.get(c)!,
        })),
        /** Same windows, split by tier — which plans people are buying. */
        tiers: newTierRows,
      },
      /** How long subscribers stay: observed tenure (paying so far, ended
       *  completed, both together) and the lifetime the last 30 days' churn
       *  implies. */
      lifetime,
      tiers,
      acquisitionSources: [...acquisitionCounts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      list: isAdmin
        ? {
            status,
            tierId,
            q: q || null,
            limit,
            offset,
            total: listTotal,
            subscribers,
          }
        : null,
    };

    return NextResponse.json(isAdmin ? payload : withoutRevenue(payload));
  } catch (error) {
    console.error("GET /api/admin/subscribers error:", error);
    return NextResponse.json(
      { error: "Failed to load subscribers" },
      { status: 500 }
    );
  }
}

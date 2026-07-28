import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
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
 * MRR is list-price only: tier price × active subs. Coupons and the VIP
 * lifetime plan bill less than list, so it is an upper bound — flagged as such
 * in the UI rather than silently reported as revenue.
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

    const [
      tierRows,
      activeGroups,
      cancelingGroups,
      providerGroups,
      acquisitionGroups,
      activeTotal,
      cancelingTotal,
      expiredTotal,
      compedTotal,
      new24h,
      new7d,
      new30d,
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
      prisma.subscription.groupBy({
        by: ["tierId"],
        where: activeWhere,
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ["tierId"],
        where: { ...activeWhere, cancelAtPeriodEnd: true },
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ["tierId", "provider"],
        where: activeWhere,
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ["acquisitionSource"],
        where: activeWhere,
        _count: { _all: true },
      }),
      prisma.subscription.count({ where: activeWhere }),
      prisma.subscription.count({
        where: { ...activeWhere, cancelAtPeriodEnd: true },
      }),
      prisma.subscription.count({
        where: { currentPeriodEnd: { lt: now }, ...providerBacked },
      }),
      prisma.user.count({ where: compedWhere }),
      prisma.subscription.count({
        where: { ...providerBacked, createdAt: { gte: since(1) } },
      }),
      prisma.subscription.count({
        where: { ...providerBacked, createdAt: { gte: since(7) } },
      }),
      prisma.subscription.count({
        where: { ...providerBacked, createdAt: { gte: since(30) } },
      }),
    ]);

    const activeByTier = new Map(
      activeGroups.map((g) => [g.tierId, g._count._all])
    );
    const cancelingByTier = new Map(
      cancelingGroups.map((g) => [g.tierId, g._count._all])
    );
    const providerByTier = new Map<string, { stripe: number; paypal: number }>();
    for (const g of providerGroups) {
      const entry = providerByTier.get(g.tierId) ?? { stripe: 0, paypal: 0 };
      if (g.provider === "paypal") entry.paypal += g._count._all;
      else entry.stripe += g._count._all;
      providerByTier.set(g.tierId, entry);
    }

    const tiers = tierRows.map((t) => {
      const active = activeByTier.get(t.id) ?? 0;
      const providers = providerByTier.get(t.id) ?? { stripe: 0, paypal: 0 };
      return {
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        priceUsd: centsToUsd(t.priceUsdCents),
        creditsPerMonth: t.creditsPerMonth,
        isActive: t.isActive,
        active,
        canceling: cancelingByTier.get(t.id) ?? 0,
        sharePct: activeTotal > 0 ? (active / activeTotal) * 100 : null,
        mrrUsd: centsToUsd(active * t.priceUsdCents),
        stripe: providers.stripe,
        paypal: providers.paypal,
      };
    });

    // Subs whose tierId no longer resolves to a tier row would silently vanish
    // from the per-tier table while still counting in the total — surface the
    // discrepancy instead.
    const tieredActive = tiers.reduce((s, t) => s + t.active, 0);
    const untieredActive = activeTotal - tieredActive;

    const mrrUsd = tiers.reduce((s, t) => s + t.mrrUsd, 0);
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
        mrrUsd,
        stripe: providerTotals.stripe,
        paypal: providerTotals.paypal,
      },
      newSubscribers: { last24h: new24h, last7d: new7d, last30d: new30d },
      tiers,
      acquisitionSources: acquisitionGroups
        .map((g) => ({
          source: g.acquisitionSource ?? "direct",
          count: g._count._all,
        }))
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

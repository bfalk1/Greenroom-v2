"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "./analytics/Panel";

/**
 * Admin "Subscribers" section — headline subscriber counts, the per-tier mix,
 * and a filterable roster, driven by GET /api/admin/subscribers.
 *
 * Counts use the same definitions as the analytics Overview: "paying" means a
 * provider-backed subscription inside its period; "comped" is the beta bypass
 * (access flag, no billing row, no tier).
 */

type Status = "active" | "canceling" | "expired" | "comped";

const STATUS_TABS: { id: Status; label: string }[] = [
  { id: "active", label: "Paying" },
  { id: "canceling", label: "Canceling" },
  { id: "comped", label: "Comped" },
  { id: "expired", label: "Expired" },
];

/** Mutually-exclusive billing cohorts, classified server-side by @/lib/mrr. */
type CohortKey = "list" | "lifetime" | "promo" | "annual";

interface CohortRow {
  key: CohortKey;
  label: string;
  active: number;
  canceling: number;
  stripe: number;
  paypal: number;
  /** Monthly-equivalent price per sub — annual is its yearly charge ÷ 12. */
  unitPriceUsd: number;
  mrrUsd: number;
}

interface TierRow {
  id: string;
  name: string;
  displayName: string;
  priceUsd: number;
  creditsPerMonth: number;
  isActive: boolean;
  active: number;
  canceling: number;
  sharePct: number | null;
  /** Effective MRR — each cohort at the price it actually bills. */
  mrrUsd: number;
  /** MRR if every sub on this tier paid monthly list price. */
  listMrrUsd: number;
  stripe: number;
  paypal: number;
  /** One entry per cohort with at least one sub on this tier. */
  cohorts: CohortRow[];
}

interface SubscriberRow {
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
}

interface SubscribersResponse {
  generatedAt: string;
  totals: {
    active: number;
    canceling: number;
    expired: number;
    comped: number;
    withAccess: number;
    untieredActive: number;
    mrrUsd: number;
    listMrrUsd: number;
    lifetimeActive: number;
    /** Active subs from the $5.99-first-month /promo funnel. */
    promoActive: number;
    /** Active subs on yearly billing. */
    annualActive: number;
    promoFirstMonthUsd: number;
    avgMrrUsd: number | null;
    avgCreditsPerMonth: number | null;
    monthlyCreditsTotal: number;
    stripe: number;
    paypal: number;
  };
  newSubscribers: {
    last24h: number;
    last7d: number;
    last30d: number;
    cohorts: {
      key: CohortKey;
      label: string;
      last24h: number;
      last7d: number;
      last30d: number;
    }[];
  };
  tiers: TierRow[];
  acquisitionSources: { source: string; count: number }[];
  list: {
    status: Status;
    tierId: string | null;
    q: string | null;
    limit: number;
    offset: number;
    total: number;
    subscribers: SubscriberRow[];
  };
}

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");

const fmtUsd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(1)}%`;

const fmtNum = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: 1 });

const fmtDate = (iso: string | null) =>
  iso == null
    ? "—"
    : new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

/** Tier accent colors, keyed by the tier's short name (GA / VIP / AA). */
const TIER_COLOR: Record<string, string> = {
  GA: "#39b54a",
  VIP: "#e0b33c",
  AA: "#7c9cf5",
};
const tierColor = (name: string) => TIER_COLOR[name.toUpperCase()] ?? "#a1a1a1";

/** Cohort accents, reused wherever the offer split is broken out. */
const COHORT_COLOR: Record<CohortKey, string> = {
  list: "#a1a1a1",
  annual: "#7c9cf5",
  promo: "#e0b33c",
  lifetime: "#39b54a",
};

/**
 * Roster-row annual test — mirrors cohortOf() in @/lib/mrr (period spanning
 * more than ~300 days). Comped rows have no period and are never annual.
 */
const ANNUAL_SPAN_MS = 1000 * 60 * 60 * 24 * 300;
const isAnnualRow = (s: SubscriberRow) =>
  s.currentPeriodStart != null &&
  s.currentPeriodEnd != null &&
  new Date(s.currentPeriodEnd).getTime() -
    new Date(s.currentPeriodStart).getTime() >
    ANNUAL_SPAN_MS;

function BigStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 min-w-0">
      <p className="text-xs font-medium text-[#a1a1a1] leading-snug truncate">
        {label}
      </p>
      <p
        className="text-2xl font-bold tabular-nums leading-tight mt-1 truncate"
        style={{ color: accent ?? "#fff" }}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-[#666] mt-1 leading-tight">{hint}</p>
      )}
    </div>
  );
}

function ProviderPill({ provider }: { provider: string | null }) {
  if (!provider) {
    return <span className="text-[#444]">—</span>;
  }
  const isPaypal = provider === "paypal";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
        isPaypal
          ? "bg-[#7c9cf5]/10 text-[#7c9cf5]"
          : "bg-[#a1a1a1]/10 text-[#a1a1a1]"
      }`}
    >
      {isPaypal ? "PayPal" : "Stripe"}
    </span>
  );
}

function SubscribersSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-[92px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg"
          />
        ))}
      </div>
      <div className="h-[260px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
      <div className="h-[420px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
    </div>
  );
}

export function SubscribersPanel() {
  const [status, setStatus] = useState<Status>("active");
  const [tierId, setTierId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);

  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasDataRef = useRef(false);

  // Debounce typing into the search box into the `query` the effect fetches on.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({
      status,
      limit: String(limit),
      offset: String(offset),
    });
    if (tierId) params.set("tierId", tierId);
    if (query) params.set("q", query);

    fetch(`/api/admin/subscribers?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json() as Promise<SubscribersResponse>;
      })
      .then((json) => {
        setData(json);
        hasDataRef.current = true;
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load subscribers");
      })
      .finally(() => {
        // A superseded request must not clear state the newer one just set.
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => ctrl.abort();
  }, [status, tierId, query, offset, limit, reloadKey]);

  const startPending = useCallback(() => {
    setError(null);
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);
  }, []);

  const changeStatus = (next: Status) => {
    if (next === status) return;
    startPending();
    setStatus(next);
    // Tier filtering is meaningless for comped users (they have no tier).
    if (next === "comped") setTierId(null);
    setOffset(0);
  };

  const changeTier = (next: string | null) => {
    if (next === tierId) return;
    startPending();
    setTierId(next);
    setOffset(0);
  };

  const changePage = (nextOffset: number) => {
    startPending();
    setOffset(nextOffset);
  };

  const retry = () => {
    startPending();
    setReloadKey((n) => n + 1);
  };

  if (loading && !data) return <SubscribersSkeleton />;

  if (error && !data) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-10 flex flex-col items-center text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-1">
          Couldn&apos;t load subscribers
        </h3>
        <p className="text-sm text-[#a1a1a1] mb-4">{error}</p>
        <Button onClick={retry} className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const t = data.totals;
  const list = data.list;
  const pageStart = list.total === 0 ? 0 : list.offset + 1;
  const pageEnd = Math.min(list.offset + list.limit, list.total);

  // A tier splits into one row per billing cohort it actually has — monthly
  // list, annual, promo, lifetime — so every row's Price × Subscribers equals
  // its MRR. A tier whose subs are all on one cohort still renders one row.
  const share = (n: number) => (t.active > 0 ? (n / t.active) * 100 : null);
  const tierTableRows = data.tiers.flatMap((tier) => {
    const retired = tier.isActive ? "" : " · retired";
    const credits = `${fmtInt(tier.creditsPerMonth)} credits/mo`;
    const only = tier.cohorts.length <= 1;

    // A tier nobody is on has no cohorts — keep it in the table as an empty
    // row rather than dropping it, so the configured lineup stays visible.
    if (tier.cohorts.length === 0) {
      return [
        {
          tierName: tier.name,
          creditsPerMonth: tier.creditsPerMonth,
          key: `${tier.id}:empty`,
          label: tier.displayName,
          detail: `${tier.name} · ${credits}${retired}`,
          indented: false,
          priceUsd: tier.priceUsd,
          active: 0,
          canceling: 0,
          stripe: 0,
          paypal: 0,
          sharePct: tier.sharePct,
          mrrUsd: 0,
        },
      ];
    }

    // Label + sub-label per cohort. The plain-monthly row keeps the tier's own
    // name so an untouched tier reads exactly as it did before cohorts existed.
    const detailFor = (c: CohortRow): { label: string; detail: string } => {
      switch (c.key) {
        case "lifetime":
          return {
            label: `${tier.displayName} · Lifetime`,
            detail: `locked ${fmtUsd(c.unitPriceUsd)}/mo · same ${credits}`,
          };
        case "promo":
          return {
            label: `${tier.displayName} · Promo`,
            detail: `${fmtUsd(t.promoFirstMonthUsd)} first month, then ${fmtUsd(
              tier.priceUsd
            )} · same ${credits}`,
          };
        case "annual":
          return {
            label: `${tier.displayName} · Annual`,
            detail: `${fmtUsd(c.unitPriceUsd * 12)}/yr = ${fmtUsd(
              c.unitPriceUsd
            )}/mo · 12× ${fmtInt(tier.creditsPerMonth)} credits upfront`,
          };
        default:
          return {
            label: tier.displayName,
            detail: `${tier.name} · ${credits}${only ? "" : " · monthly list price"}${retired}`,
          };
      }
    };

    return tier.cohorts.map((c) => {
      const { label, detail } = detailFor(c);
      return {
        tierName: tier.name,
        creditsPerMonth: tier.creditsPerMonth,
        key: `${tier.id}:${c.key}`,
        label,
        detail,
        /** Sub-cohorts render indented under the tier's plain monthly row. */
        indented: c.key !== "list" && !only,
        priceUsd: c.unitPriceUsd,
        active: c.active,
        canceling: c.canceling,
        stripe: c.stripe,
        paypal: c.paypal,
        sharePct: only ? tier.sharePct : share(c.active),
        mrrUsd: c.mrrUsd,
      };
    });
  });
  const maxTierCount = Math.max(1, ...tierTableRows.map((x) => x.active));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Subscribers</h2>
          <p className="text-sm text-[#a1a1a1]">
            Who&apos;s subscribed right now, and on which tier
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />}
          <span className="text-xs text-[#666] tabular-nums">
            as of{" "}
            {new Date(data.generatedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={retry}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs text-[#a1a1a1] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Refresh failed but stale data is still on screen */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 text-sm text-white hover:text-[#39b54a] shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      <div
        className={`space-y-4 transition-opacity duration-200 ${
          refreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        {/* Headline counts */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <BigStat
            label="Paying Subscribers"
            value={fmtInt(t.active)}
            hint={`${fmtInt(t.stripe)} Stripe · ${fmtInt(t.paypal)} PayPal`}
            accent="#39b54a"
          />
          <BigStat
            label="Comped (beta)"
            value={fmtInt(t.comped)}
            hint="access flag, no billing"
          />
          <BigStat
            label="Total With Access"
            value={fmtInt(t.withAccess)}
            hint="paying + comped"
          />
          <BigStat
            label="MRR"
            value={fmtUsd(t.mrrUsd)}
            hint={
              t.listMrrUsd > t.mrrUsd
                ? `list ${fmtUsd(t.listMrrUsd)} − ${fmtUsd(
                    t.listMrrUsd - t.mrrUsd
                  )} lifetime + annual discounts`
                : "all subscribers at list price"
            }
          />
          <BigStat
            label="Promo (first month)"
            value={fmtInt(t.promoActive)}
            hint={`${fmtUsd(t.promoFirstMonthUsd)} first month, then list`}
            accent={t.promoActive > 0 ? "#e0b33c" : undefined}
          />
          <BigStat
            label="Annual"
            value={fmtInt(t.annualActive)}
            hint={
              t.active > 0
                ? `${fmtPct((t.annualActive / t.active) * 100)} of paying subscribers`
                : "billed yearly"
            }
            accent={t.annualActive > 0 ? "#7c9cf5" : undefined}
          />
          <BigStat
            label="Avg MRR / Subscriber"
            value={fmtUsd(t.avgMrrUsd)}
            hint="effective MRR ÷ paying subscribers"
          />
          <BigStat
            label="Avg Credits / Subscriber"
            value={
              t.avgCreditsPerMonth == null
                ? "—"
                : `${fmtNum(t.avgCreditsPerMonth)}/mo`
            }
            hint={`${fmtInt(t.monthlyCreditsTotal)} credits allocated monthly`}
          />
          <BigStat
            label="Canceling"
            value={fmtInt(t.canceling)}
            hint="active until period end"
            accent={t.canceling > 0 ? "#e0b33c" : undefined}
          />
        </div>

        {/* New subscribers */}
        <Panel
          title="New Subscribers"
          headerRight={
            <span className="text-[10px] text-[#666] whitespace-nowrap">
              by subscription start date
            </span>
          }
        >
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Last 24 hours", value: data.newSubscribers.last24h },
              { label: "Last 7 days", value: data.newSubscribers.last7d },
              { label: "Last 30 days", value: data.newSubscribers.last30d },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[11px] text-[#666] truncate">{s.label}</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {fmtInt(s.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Which offer each batch of signups came in on. Rows only appear
              for cohorts that actually signed up in the last 30 days. */}
          {data.newSubscribers.cohorts.length > 0 && (
            <div className="border-t border-[#2a2a2a] mt-4 pt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-[#666]">
                    <th className="pb-1.5 pr-4 font-medium">Offer</th>
                    <th className="pb-1.5 px-4 font-medium text-right">24h</th>
                    <th className="pb-1.5 px-4 font-medium text-right">7d</th>
                    <th className="pb-1.5 pl-4 font-medium text-right">30d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.newSubscribers.cohorts.map((c) => (
                    <tr key={c.key} className="border-t border-[#1f1f1f]">
                      <td className="py-1.5 pr-4 text-[#a1a1a1]">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: COHORT_COLOR[c.key] }}
                          />
                          {c.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-right text-white tabular-nums">
                        {fmtInt(c.last24h)}
                      </td>
                      <td className="py-1.5 px-4 text-right text-white tabular-nums">
                        {fmtInt(c.last7d)}
                      </td>
                      <td className="py-1.5 pl-4 text-right text-white tabular-nums">
                        {fmtInt(c.last30d)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Tier mix */}
        <Panel
          title="Tier Breakdown"
          headerRight={
            <span className="text-[10px] text-[#666] whitespace-nowrap">
              paying subscribers only
            </span>
          }
        >
          {data.tiers.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#a1a1a1]">
              No subscription tiers configured.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#a1a1a1] border-b border-[#2a2a2a]">
                    <th className="py-2 pr-4 font-medium">Tier</th>
                    <th className="py-2 px-4 font-medium text-right">Price</th>
                    <th className="py-2 px-4 font-medium text-right">
                      Subscribers
                    </th>
                    <th className="py-2 px-4 font-medium w-[22%]">Share</th>
                    <th className="py-2 px-4 font-medium text-right">Stripe</th>
                    <th className="py-2 px-4 font-medium text-right">PayPal</th>
                    <th className="py-2 px-4 font-medium text-right">Canceling</th>
                    <th className="py-2 pl-4 font-medium text-right">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {tierTableRows.map((row) => (
                    <tr key={row.key} className="border-b border-[#1f1f1f]">
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center gap-2 ${
                            row.indented ? "pl-4" : ""
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={
                              row.indented
                                ? {
                                    boxShadow: `inset 0 0 0 1.5px ${tierColor(
                                      row.tierName
                                    )}`,
                                  }
                                : { backgroundColor: tierColor(row.tierName) }
                            }
                          />
                          <span className="text-white font-medium">
                            {row.label}
                          </span>
                        </span>
                        <span
                          className={`block text-xs text-[#666] ${
                            row.indented ? "pl-8" : "pl-4"
                          }`}
                        >
                          {row.detail}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-[#a1a1a1] tabular-nums">
                        {fmtUsd(row.priceUsd)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-white font-bold tabular-nums">
                        {fmtInt(row.active)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#0a0a0a] rounded-full overflow-hidden min-w-[40px]">
                            <div
                              className={`h-full rounded-full ${
                                row.indented ? "opacity-60" : ""
                              }`}
                              style={{
                                width: `${(row.active / maxTierCount) * 100}%`,
                                backgroundColor: tierColor(row.tierName),
                              }}
                            />
                          </div>
                          <span className="text-xs text-[#a1a1a1] tabular-nums w-12 text-right shrink-0">
                            {fmtPct(row.sharePct)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right text-[#a1a1a1] tabular-nums">
                        {fmtInt(row.stripe)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[#a1a1a1] tabular-nums">
                        {fmtInt(row.paypal)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.canceling > 0 ? (
                          <span className="text-yellow-400">
                            {fmtInt(row.canceling)}
                          </span>
                        ) : (
                          <span className="text-[#444]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-4 text-right text-white font-medium tabular-nums">
                        {fmtUsd(row.mrrUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {t.untieredActive > 0 && (
            <p className="text-[11px] text-yellow-400 mt-3">
              {fmtInt(t.untieredActive)} paying subscriber
              {t.untieredActive === 1 ? "" : "s"} reference a tier that no longer
              exists and aren&apos;t counted in the rows above.
            </p>
          )}

          {data.acquisitionSources.length > 0 && (
            <div className="border-t border-[#2a2a2a] mt-4 pt-4">
              <p className="text-[11px] text-[#666] mb-2">Acquisition source</p>
              <div className="flex flex-wrap gap-2">
                {data.acquisitionSources.map((s) => (
                  <span
                    key={s.source}
                    className="inline-flex items-center gap-1.5 bg-[#0a0a0a] border border-[#2a2a2a] rounded-full px-2.5 py-1 text-xs text-[#a1a1a1]"
                  >
                    {s.source}
                    <span className="text-white font-medium tabular-nums">
                      {fmtInt(s.count)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Roster */}
        <Panel title="Subscriber List">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => changeStatus(tab.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition whitespace-nowrap ${
                    status === tab.id
                      ? "bg-[#39b54a] text-black font-medium"
                      : "text-[#a1a1a1] hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {status !== "comped" && data.tiers.length > 0 && (
              <div className="flex gap-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => changeTier(null)}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    tierId === null
                      ? "bg-[#2a2a2a] text-white font-medium"
                      : "text-[#a1a1a1] hover:text-white"
                  }`}
                >
                  All tiers
                </button>
                {data.tiers.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => changeTier(tier.id)}
                    className={`px-3 py-1.5 text-sm rounded-md transition whitespace-nowrap ${
                      tierId === tier.id
                        ? "bg-[#2a2a2a] text-white font-medium"
                        : "text-[#a1a1a1] hover:text-white"
                    }`}
                  >
                    {tier.name}
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#666] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or username…"
                className="pl-9 bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>

          {list.subscribers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-[#2a2a2a] mx-auto mb-3" />
              <p className="text-[#a1a1a1] text-sm">
                {query
                  ? "No subscribers match that search."
                  : "No subscribers in this group."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#a1a1a1] border-b border-[#2a2a2a]">
                      <th className="py-2 pr-4 font-medium">Subscriber</th>
                      <th className="py-2 px-4 font-medium">Tier</th>
                      <th className="py-2 px-4 font-medium">Provider</th>
                      <th className="py-2 px-4 font-medium">Started</th>
                      <th className="py-2 pl-4 font-medium">
                        {status === "expired" ? "Ended" : "Renews"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.subscribers.map((s) => (
                      <tr key={s.userId} className="border-b border-[#1f1f1f]">
                        <td className="py-2.5 pr-4 min-w-0">
                          <span className="text-white font-medium">{s.name}</span>
                          {s.role === "CREATOR" && (
                            <span className="ml-2 text-[10px] text-[#39b54a] border border-[#39b54a]/30 rounded px-1.5 py-0.5">
                              Creator
                            </span>
                          )}
                          <span className="block text-xs text-[#666] truncate">
                            {s.email}
                            {s.username && ` (@${s.username})`}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {s.tierName ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                              style={{
                                color: tierColor(s.tierName),
                                backgroundColor: `${tierColor(s.tierName)}1a`,
                              }}
                            >
                              {s.tierName}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#666]">
                              comped
                            </span>
                          )}
                          {isAnnualRow(s) && (
                            <span
                              className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                color: COHORT_COLOR.annual,
                                backgroundColor: `${COHORT_COLOR.annual}1a`,
                              }}
                            >
                              annual
                            </span>
                          )}
                          {s.acquisitionSource && (
                            <span className="block text-[10px] text-[#666] mt-0.5">
                              {s.acquisitionSource}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <ProviderPill provider={s.provider} />
                        </td>
                        <td className="py-2.5 px-4 text-[#a1a1a1] whitespace-nowrap">
                          {fmtDate(s.startedAt)}
                        </td>
                        <td className="py-2.5 pl-4 whitespace-nowrap">
                          <span className="text-[#a1a1a1]">
                            {fmtDate(s.currentPeriodEnd)}
                          </span>
                          {s.cancelAtPeriodEnd && (
                            <span className="block text-[10px] text-yellow-400">
                              cancels
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-xs text-[#666] tabular-nums">
                  {pageStart}–{pageEnd} of {fmtInt(list.total)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => changePage(Math.max(0, list.offset - list.limit))}
                    disabled={list.offset === 0 || refreshing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-[#0a0a0a] border border-[#2a2a2a] text-[#a1a1a1] hover:text-white disabled:opacity-40 disabled:hover:text-[#a1a1a1]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(list.offset + list.limit)}
                    disabled={pageEnd >= list.total || refreshing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-[#0a0a0a] border border-[#2a2a2a] text-[#a1a1a1] hover:text-white disabled:opacity-40 disabled:hover:text-[#a1a1a1]"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </Panel>

        <p className="text-xs text-[#666]">
          Paying = a Stripe or PayPal subscription inside its current period.
          MRR counts VIP lifetime-offer subscribers at their locked discounted
          price and annual subscribers at their yearly charge ÷ 12; everyone
          else, including the {fmtUsd(t.promoFirstMonthUsd)} first-month promo
          cohort, counts at list price — that discount covers one cycle, then
          renews at full price. Annual is identified by a billing period
          spanning about a year (the interval isn&apos;t stored on our side);
          other one-off coupons aren&apos;t tracked. Averages are per paying
          subscriber — comped accounts are excluded.
        </p>
      </div>
    </div>
  );
}

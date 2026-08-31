"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Music,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard, pctDelta } from "./StatCard";
import { TrendModal, type MetricConfig } from "./TrendModal";
import type {
  LiveNow,
  MetricKey,
  OverviewResponse,
  SeriesPoint,
} from "./types";

/**
 * Admin analytics Overview — clickable KPI tiles (live/DAU/WAU/MAU, today's
 * purchases/credits/new subs, 7-day landing & promo conversion), each opening
 * a trend drill-down, driven by GET /api/admin/analytics. Engagement and
 * conversion tiles come from PostHog and render a setup state until the
 * query-API envs exist. Mounted inside the admin dashboard's Overview
 * section; `onNavigate` lets the action-item cards switch dashboard sections.
 */

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(n < 1 && n > 0 ? 2 : 1)}%`;

const METRICS: Record<MetricKey, MetricConfig> = {
  live: {
    key: "live",
    title: "Live Active Users",
    description:
      "Unique people (signed in or anonymous) with any activity in the last 5 minutes. Chart: unique visitors per hour. Source: PostHog.",
    ranges: [
      { id: "24h", label: "24H" },
      { id: "48h", label: "48H" },
      { id: "7d", label: "7D" },
    ],
    format: "int",
    tooltipLabel: "visitors",
  },
  dau: {
    key: "dau",
    title: "Daily Active Users",
    description:
      "Unique signed-in users with any activity that day. Source: PostHog.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
    ],
    format: "int",
    tooltipLabel: "users",
  },
  wau: {
    key: "wau",
    title: "Weekly Active Users",
    description:
      "Unique signed-in users active in each week (Monday-start). The tile shows the rolling last 7 days. Source: PostHog.",
    ranges: [
      { id: "12w", label: "12W" },
      { id: "26w", label: "26W" },
      { id: "52w", label: "52W" },
    ],
    format: "int",
    tooltipLabel: "users",
  },
  mau: {
    key: "mau",
    title: "Monthly Active Users",
    description:
      "Unique signed-in users active in each calendar month. The tile shows the rolling last 30 days. Source: PostHog.",
    ranges: [
      { id: "6m", label: "6M" },
      { id: "12m", label: "12M" },
      { id: "24m", label: "24M" },
    ],
    format: "int",
    tooltipLabel: "users",
  },
  purchases: {
    key: "purchases",
    title: "Items Purchased",
    description:
      "Marketplace purchases per day (samples + presets). All time is bucketed weekly.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
      { id: "all", label: "All" },
    ],
    format: "int",
    tooltipLabel: "purchases",
  },
  credits: {
    key: "credits",
    title: "Credits Spent",
    description:
      "Credits redeemed on marketplace purchases per day. All time is bucketed weekly.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
      { id: "all", label: "All" },
    ],
    format: "int",
    tooltipLabel: "credits",
  },
  subs: {
    key: "subs",
    title: "New Subscribers",
    description:
      "Subscriptions started per day (a user's first activation). All time is bucketed weekly.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
      { id: "all", label: "All" },
    ],
    format: "int",
    tooltipLabel: "new subscribers",
  },
  landing_conversion: {
    key: "landing_conversion",
    title: "Landing Page Conversion",
    description:
      "Of unique landing-page (/) visitors each day, the share who signed up the same day. Source: PostHog.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
    ],
    format: "percent",
    tooltipLabel: "conversion",
  },
  promo_conversion: {
    key: "promo_conversion",
    title: "VIP Promo Conversion",
    description:
      "Of unique /promo offer viewers each day, the share who activated a paid subscription the same day. Source: PostHog.",
    ranges: [
      { id: "30d", label: "30D" },
      { id: "90d", label: "90D" },
      { id: "180d", label: "180D" },
    ],
    format: "percent",
    tooltipLabel: "conversion",
  },
};

const REPORT_TYPES = [
  { id: "revenue", label: "Revenue" },
  { id: "downloads", label: "Downloads" },
  { id: "users", label: "Users" },
  { id: "payouts", label: "Payouts" },
  { id: "transactions", label: "Transactions" },
  { id: "samples", label: "Samples" },
];

const REPORT_RANGES = [
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: null, label: "All" },
] as const;

function DownloadReportMenu() {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number | null>(30);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const hrefFor = (type: string) => {
    const params = new URLSearchParams({ type });
    if (days != null) {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - days);
      params.set("from", from.toISOString());
      params.set("to", to.toISOString());
    }
    return `/api/admin/export?${params.toString()}`;
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        onClick={() => setOpen((o) => !o)}
        className="h-9 bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#242424]"
      >
        <Download className="w-4 h-4 mr-2" />
        Download Report
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-20 py-1">
          <div className="flex gap-1 px-2 pt-1.5 pb-2 border-b border-[#2a2a2a]/60">
            {REPORT_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setDays(r.days)}
                className={`flex-1 px-2 py-1 text-xs rounded transition ${
                  days === r.days
                    ? "bg-[#39b54a] text-black font-medium"
                    : "text-[#a1a1a1] hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {REPORT_TYPES.map((t) => (
            // The export route responds with Content-Disposition: attachment,
            // so a plain anchor downloads without leaving the dashboard.
            <a
              key={t.id}
              href={hrefFor(t.id)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#a1a1a1] hover:bg-[#242424] hover:text-white"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              {t.label} CSV
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#666] mb-2">
      {children}
    </h3>
  );
}

function ActionItemCard({
  label,
  count,
  icon: Icon,
  onClick,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex items-center gap-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 text-left transition ${
        clickable
          ? "hover:border-[#39b54a]/50 hover:bg-[#1f1f1f]"
          : "cursor-default"
      }`}
    >
      <div
        className={`p-2 rounded-lg shrink-0 ${
          count > 0 ? "bg-[#39b54a]/10" : "bg-[#2a2a2a]/40"
        }`}
      >
        <Icon
          className={`w-4 h-4 ${count > 0 ? "text-[#39b54a]" : "text-[#666]"}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#a1a1a1] truncate">{label}</p>
        <p className="text-xl font-bold text-white tabular-nums">
          {fmtInt(count)}
        </p>
      </div>
      {clickable && <ChevronRight className="w-4 h-4 text-[#666] shrink-0" />}
    </button>
  );
}

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-6 w-32 bg-[#1a1a1a] rounded mb-2" />
          <div className="h-4 w-64 bg-[#1a1a1a] rounded" />
        </div>
        <div className="h-9 w-44 bg-[#1a1a1a] rounded" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[128px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[128px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-[128px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}

interface AnalyticsOverviewProps {
  /** Switch the surrounding dashboard to another section (e.g. "applications"). */
  onNavigate?: (section: string) => void;
}

export default function AnalyticsOverview({ onNavigate }: AnalyticsOverviewProps) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  // Fresher live numbers from the 60s poll, layered over the last full load.
  const [livePoll, setLivePoll] = useState<
    (LiveNow & { series: SeriesPoint[] }) | null
  >(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();

    fetch("/api/admin/analytics", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json() as Promise<OverviewResponse>;
      })
      .then((json) => {
        setData(json);
        setLivePoll(null);
        hasDataRef.current = true;
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      })
      .finally(() => {
        // A superseded request must not clear the state the new one just set.
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => ctrl.abort();
  }, [reloadKey]);

  // Keep the live tile current: one cheap trend query per minute, skipped in
  // background tabs and while the live drill-down (which polls itself) is up.
  const liveAvailable = !!data?.engagement.live;
  useEffect(() => {
    if (!liveAvailable) return;
    const timer = setInterval(async () => {
      if (document.hidden || openMetric === "live") return;
      try {
        const res = await fetch("/api/admin/analytics/trend?metric=live&range=24h");
        if (!res.ok) return;
        const json = (await res.json()) as {
          live?: LiveNow;
          series: SeriesPoint[];
        };
        if (json.live) setLivePoll({ ...json.live, series: json.series });
      } catch {
        // transient poll failure — the next tick retries
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [liveAvailable, openMetric]);

  const retry = () => {
    setError(null);
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);
    setReloadKey((n) => n + 1);
  };

  if (loading && !data) {
    return <OverviewSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-10 flex flex-col items-center text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-1">
          Couldn&apos;t load analytics
        </h3>
        <p className="text-sm text-[#a1a1a1] mb-4">{error}</p>
        <Button
          onClick={retry}
          className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { engagement, commerce, conversion, posthog } = data;
  const live = livePoll ?? engagement.live;
  const needsPosthog = !posthog.configured;
  const posthogNote = needsPosthog ? "Requires PostHog setup" : "Unavailable";

  const updatedAt = new Date(data.generatedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p className="text-sm text-[#a1a1a1]">
            Click any metric to see its trend over time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {refreshing && (
            <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />
          )}
          <span className="text-xs text-[#666] tabular-nums">
            Updated {updatedAt}
          </span>
          <Button
            onClick={retry}
            aria-label="Refresh metrics"
            className="h-9 w-9 p-0 bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#242424]"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <DownloadReportMenu />
        </div>
      </div>

      {/* PostHog setup / partial-failure notices */}
      {needsPosthog && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200/90">
            Active-user and conversion metrics need the PostHog query API. Set{" "}
            <code className="text-amber-100">POSTHOG_PERSONAL_API_KEY</code> (a
            personal API key with Query read access) and{" "}
            <code className="text-amber-100">POSTHOG_PROJECT_ID</code> in
            Vercel, then redeploy. Purchases, credits and subscribers below
            come from the database and work now.
          </p>
        </div>
      )}
      {!needsPosthog && posthog.errors.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 mb-4">
          <p className="text-sm text-red-400">
            Some PostHog metrics failed: {posthog.errors[0]}
          </p>
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
        className={`space-y-6 transition-opacity duration-200 ${
          refreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        {/* Active users */}
        <section>
          <SectionLabel>Active Users</SectionLabel>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard
              label="Live Now"
              live={!!live}
              value={live ? fmtInt(live.total) : "—"}
              series={live?.series}
              note={
                live
                  ? `${fmtInt(live.identified)} signed in · last ${live.windowMinutes} min`
                  : posthogNote
              }
              onClick={live ? () => setOpenMetric("live") : undefined}
            />
            <StatCard
              label="Daily Active Users"
              value={engagement.dau ? fmtInt(engagement.dau.today) : "—"}
              delta={
                engagement.dau
                  ? pctDelta(engagement.dau.today, engagement.dau.yesterday)
                  : undefined
              }
              deltaTitle="vs yesterday (full day)"
              series={engagement.dau?.series}
              note={
                engagement.dau
                  ? `today so far · yesterday ${fmtInt(engagement.dau.yesterday)}`
                  : posthogNote
              }
              onClick={engagement.dau ? () => setOpenMetric("dau") : undefined}
            />
            <StatCard
              label="Weekly Active Users"
              value={engagement.wau ? fmtInt(engagement.wau.current) : "—"}
              delta={
                engagement.wau
                  ? pctDelta(engagement.wau.current, engagement.wau.previous)
                  : undefined
              }
              deltaTitle="vs previous 7 days"
              series={engagement.wau?.series}
              note={engagement.wau ? "rolling 7 days" : posthogNote}
              onClick={engagement.wau ? () => setOpenMetric("wau") : undefined}
            />
            <StatCard
              label="Monthly Active Users"
              value={engagement.mau ? fmtInt(engagement.mau.current) : "—"}
              delta={
                engagement.mau
                  ? pctDelta(engagement.mau.current, engagement.mau.previous)
                  : undefined
              }
              deltaTitle="vs previous 30 days"
              series={engagement.mau?.series}
              note={engagement.mau ? "rolling 30 days" : posthogNote}
              onClick={engagement.mau ? () => setOpenMetric("mau") : undefined}
            />
          </div>
        </section>

        {/* Marketplace + subscriptions, today */}
        <section>
          <SectionLabel>Today</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Items Purchased Today"
              value={fmtInt(commerce.purchases.today)}
              delta={pctDelta(commerce.purchases.today, commerce.purchases.yesterday)}
              deltaTitle="vs yesterday (full day)"
              series={commerce.purchases.series}
              note={`samples + presets · last 7 days ${fmtInt(commerce.purchases.last7)}`}
              onClick={() => setOpenMetric("purchases")}
            />
            <StatCard
              label="Credits Spent Today"
              value={fmtInt(commerce.credits.today)}
              delta={pctDelta(commerce.credits.today, commerce.credits.yesterday)}
              deltaTitle="vs yesterday (full day)"
              series={commerce.credits.series}
              note={`last 7 days ${fmtInt(commerce.credits.last7)}`}
              onClick={() => setOpenMetric("credits")}
            />
            <StatCard
              label="New Subscribers Today"
              value={fmtInt(commerce.subs.today)}
              delta={pctDelta(commerce.subs.today, commerce.subs.yesterday)}
              deltaTitle="vs yesterday (full day)"
              series={commerce.subs.series}
              note={`last 7 days ${fmtInt(commerce.subs.last7)} · ${fmtInt(commerce.subs.activeTotal)} active total`}
              onClick={() => setOpenMetric("subs")}
            />
          </div>
        </section>

        {/* Conversion */}
        <section>
          <SectionLabel>Conversion · Last 7 Days</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              label="Landing Page → Signup"
              value={conversion.landing ? fmtPct(conversion.landing.window.ratePct) : "—"}
              delta={
                conversion.landing
                  ? pctDelta(
                      conversion.landing.window.ratePct,
                      conversion.landing.window.prevRatePct
                    )
                  : undefined
              }
              deltaTitle="vs previous 7 days (relative)"
              series={conversion.landing?.series}
              note={
                conversion.landing
                  ? `${fmtInt(conversion.landing.window.visitors)} visitors → ${fmtInt(conversion.landing.window.conversions)} signups`
                  : posthogNote
              }
              onClick={
                conversion.landing
                  ? () => setOpenMetric("landing_conversion")
                  : undefined
              }
            />
            <StatCard
              label="VIP Promo → Paid Sub"
              value={conversion.promo ? fmtPct(conversion.promo.window.ratePct) : "—"}
              delta={
                conversion.promo
                  ? pctDelta(
                      conversion.promo.window.ratePct,
                      conversion.promo.window.prevRatePct
                    )
                  : undefined
              }
              deltaTitle="vs previous 7 days (relative)"
              series={conversion.promo?.series}
              note={
                conversion.promo
                  ? `${fmtInt(conversion.promo.window.visitors)} viewers → ${fmtInt(conversion.promo.window.conversions)} activations`
                  : posthogNote
              }
              onClick={
                conversion.promo
                  ? () => setOpenMetric("promo_conversion")
                  : undefined
              }
            />
          </div>
        </section>

        {/* Action items */}
        <section>
          <SectionLabel>Needs Attention</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ActionItemCard
              label="Pending Applications"
              count={data.actionItems.pendingApplications}
              icon={Clock}
              onClick={onNavigate ? () => onNavigate("applications") : undefined}
            />
            <ActionItemCard
              label="Samples in Review"
              count={data.actionItems.samplesInReview}
              icon={Music}
              onClick={onNavigate ? () => onNavigate("samples") : undefined}
            />
            <ActionItemCard
              label="Presets in Review"
              count={data.actionItems.presetsInReview}
              icon={SlidersHorizontal}
              onClick={onNavigate ? () => onNavigate("presets") : undefined}
            />
          </div>
        </section>

        <p className="text-xs text-[#666]">
          Purchases, credits and subscribers come from the app database
          (UTC days); active users and conversion come from PostHog.
        </p>
      </div>

      {openMetric && (
        <TrendModal
          config={METRICS[openMetric]}
          onClose={() => setOpenMetric(null)}
        />
      )}
    </div>
  );
}

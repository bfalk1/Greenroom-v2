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
import { Panel } from "./Panel";
import { DeltaChip, StatCard, pctDelta } from "./StatCard";
import { TrendChart } from "./TrendChart";
import type { AnalyticsResponse, Bucket, RangeKey } from "./types";

/**
 * Admin analytics Overview — KPI cards, marketplace/content/creator-economy/
 * subscriber-health panels and a today-vs-yesterday snapshot, driven by
 * GET /api/admin/analytics. Mounted inside the admin dashboard's Overview
 * section; `onNavigate` lets the action-item cards switch dashboard sections.
 */

const RANGES: { id: RangeKey; label: string }[] = [
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "all", label: "All Time" },
];

const PREV_LABEL: Record<RangeKey, string> = {
  "7d": "vs previous 7 days",
  "30d": "vs previous 30 days",
  "90d": "vs previous 90 days",
  all: "",
};

const REPORT_TYPES = [
  { id: "revenue", label: "Revenue" },
  { id: "downloads", label: "Downloads" },
  { id: "users", label: "Users" },
  { id: "payouts", label: "Payouts" },
  { id: "transactions", label: "Transactions" },
  { id: "samples", label: "Samples" },
];

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");

const fmtUsd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : n > 999 ? ">999%" : `${n.toFixed(1)}%`;

function bucketDateFormatter(bucket: Bucket) {
  return (key: string) => {
    if (bucket === "month") {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
    }
    const [y, m, d] = key.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return bucket === "week" ? `Wk of ${label}` : label;
  };
}

function DownloadReportMenu({
  range,
  rangeStart,
  rangeEnd,
}: {
  range: RangeKey;
  rangeStart: string;
  rangeEnd: string;
}) {
  const [open, setOpen] = useState(false);
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
    if (range !== "all") {
      params.set("from", rangeStart);
      params.set("to", rangeEnd);
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
        <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-20 py-1">
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

function PanelStat({
  label,
  value,
  hint,
  delta,
  deltaTitle,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  deltaTitle?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[#666] truncate" title={label}>
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <p className="text-lg font-bold text-white tabular-nums">{value}</p>
        {delta !== undefined && <DeltaChip delta={delta} title={deltaTitle} />}
      </div>
      {hint && <p className="text-[10px] text-[#666] leading-tight">{hint}</p>}
    </div>
  );
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-[#2a2a2a]/60 last:border-0">
      <span className="text-sm text-[#a1a1a1] min-w-0">
        {label}
        {hint && <span className="text-xs text-[#666]"> · {hint}</span>}
      </span>
      <span className="text-sm font-semibold text-white tabular-nums shrink-0">
        {value}
      </span>
    </div>
  );
}

function SnapshotRow({
  label,
  today,
  yesterday,
  format,
}: {
  label: string;
  today: number;
  yesterday: number;
  format: (n: number) => string;
}) {
  return (
    <div className="py-2.5 border-b border-[#2a2a2a]/60 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[#a1a1a1]">{label}</p>
        <DeltaChip delta={pctDelta(today, yesterday)} title="vs yesterday" />
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <p className="text-lg font-bold text-white tabular-nums">{format(today)}</p>
        <p className="text-[11px] text-[#666] tabular-nums">
          yesterday {format(yesterday)}
        </p>
      </div>
    </div>
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
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-6 w-32 bg-[#1a1a1a] rounded mb-2" />
          <div className="h-4 w-64 bg-[#1a1a1a] rounded" />
        </div>
        <div className="h-9 w-80 bg-[#1a1a1a] rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
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
            className="h-[76px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="space-y-4">
          <div className="h-[340px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
          <div className="h-[320px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-[240px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
            <div className="h-[240px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
          </div>
        </div>
        <div className="h-[440px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg" />
      </div>
    </div>
  );
}

interface AnalyticsOverviewProps {
  /** Switch the surrounding dashboard to another section (e.g. "applications"). */
  onNavigate?: (section: string) => void;
}

export default function AnalyticsOverview({ onNavigate }: AnalyticsOverviewProps) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasDataRef = useRef(false);

  // Pending-state flips happen in the event handlers below (changeRange /
  // retry), not in the effect body — the effect only runs the fetch.
  useEffect(() => {
    const ctrl = new AbortController();

    fetch(`/api/admin/analytics?range=${range}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        return res.json() as Promise<AnalyticsResponse>;
      })
      .then((json) => {
        setData(json);
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
  }, [range, reloadKey]);

  const changeRange = (next: RangeKey) => {
    if (next === range) return;
    setError(null);
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);
    setRange(next);
  };

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

  const fmtBucketDate = bucketDateFormatter(data.bucket);
  const deltaTitle = data.previous ? PREV_LABEL[data.range] : "no previous period";
  const k = data.kpis;
  const m = data.marketplace;
  const c = data.content;
  const ce = data.creatorEconomy;
  const sh = data.subscriberHealth;

  // Format from the server's YYYY-MM-DD day keys (parsed as local dates, same
  // as chart bucket labels) — formatting the ISO instants with the browser's
  // timezone would show a different date than the charts for non-UTC admins.
  const fmtDayKey = (key: string, withYear: boolean) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" as const } : {}),
    });
  };
  const rangeLabel =
    data.range === "all"
      ? `All time · since ${fmtDayKey(data.rangeStartDay, true)}`
      : `${fmtDayKey(data.rangeStartDay, false)} – ${fmtDayKey(data.rangeEndDay, true)}`;

  return (
    <div>
      {/* Header: subtitle + range picker + report download */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Overview</h2>
          <p className="text-sm text-[#a1a1a1]">
            Key metrics and performance at a glance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {refreshing && (
            <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />
          )}
          <span className="text-xs text-[#666] tabular-nums">{rangeLabel}</span>
          <div className="flex gap-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => changeRange(r.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition whitespace-nowrap ${
                  range === r.id
                    ? "bg-[#39b54a] text-black font-medium"
                    : "text-[#a1a1a1] hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <DownloadReportMenu
            range={data.range}
            rangeStart={data.rangeStart}
            rangeEnd={data.rangeEnd}
          />
        </div>
      </div>

      {/* Refresh failed but stale data is still shown */}
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
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            label="Active Subscribers"
            value={fmtInt(k.activeSubscribers.current)}
            delta={pctDelta(
              k.activeSubscribers.renewals.current,
              k.activeSubscribers.renewals.previous
            )}
            deltaTitle={`Subscription renewals ${deltaTitle}`}
            series={k.activeSubscribers.series}
            note="Paying · Δ from renewals/day"
          />
          <StatCard
            label="Items Purchased"
            value={fmtInt(k.samplesPurchased.current)}
            delta={pctDelta(k.samplesPurchased.current, k.samplesPurchased.previous)}
            deltaTitle={deltaTitle}
            series={k.samplesPurchased.series}
          />
          <StatCard
            label="Credit Utilization"
            value={fmtPct(k.creditUtilization.current)}
            delta={pctDelta(k.creditUtilization.current, k.creditUtilization.previous)}
            deltaTitle={deltaTitle}
            series={k.creditUtilization.series}
            note="Redeemed ÷ granted"
          />
          <StatCard
            label="Royalties Paid"
            value={fmtUsd(k.royaltiesPaidUsd.current)}
            delta={pctDelta(k.royaltiesPaidUsd.current, k.royaltiesPaidUsd.previous)}
            deltaTitle={deltaTitle}
            series={k.royaltiesPaidUsd.series}
          />
          <StatCard
            label="Active Creators"
            value={fmtInt(k.activeCreators.current)}
            delta={pctDelta(k.activeCreators.current, k.activeCreators.previous)}
            deltaTitle={deltaTitle}
            series={k.activeCreators.series}
            note="≥1 sale or upload"
          />
          <StatCard
            label="New Creators"
            value={fmtInt(k.newCreators.current)}
            delta={pctDelta(k.newCreators.current, k.newCreators.previous)}
            deltaTitle={deltaTitle}
            series={k.newCreators.series}
          />
        </div>

        {/* Action items */}
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

        {/* Main grid: panels + today sidebar */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Panel
              title="Marketplace"
              headerRight={
                <span className="text-[10px] text-[#666] whitespace-nowrap">
                  outstanding is point-in-time
                </span>
              }
            >
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-3 mb-5">
                <PanelStat
                  label="Items Purchased"
                  value={fmtInt(m.samplesPurchased)}
                />
                <PanelStat
                  label="Credits Redeemed"
                  value={fmtInt(m.creditsRedeemed)}
                />
                <PanelStat
                  label="Credit Utilization"
                  value={fmtPct(m.creditUtilizationPct)}
                  hint={`of ${fmtInt(m.creditsGranted)} granted`}
                />
                <PanelStat
                  label="Royalties Paid"
                  value={fmtUsd(m.royaltiesPaidUsd)}
                />
                <PanelStat
                  label="Credits Outstanding"
                  value={fmtInt(m.creditsOutstanding)}
                  hint="all user balances"
                />
              </div>
              <p className="text-xs font-medium text-[#a1a1a1] mb-3">
                Items Purchased
              </p>
              <TrendChart
                data={m.purchasesSeries}
                label="purchases"
                formatValue={fmtInt}
                formatDate={fmtBucketDate}
              />
            </Panel>

            <Panel title="Content">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 mb-5">
                <PanelStat
                  label="New Samples Uploaded"
                  value={fmtInt(c.newSamples)}
                  delta={pctDelta(c.newSamples, c.newSamplesPrevious)}
                  deltaTitle={deltaTitle}
                />
                <PanelStat
                  label="Total Samples"
                  value={fmtInt(c.totalPublishedSamples)}
                  hint="published"
                />
                <PanelStat
                  label="Avg Purchases / Sample"
                  value={
                    c.avgPurchasesPerPurchasedSample == null
                      ? "—"
                      : c.avgPurchasesPerPurchasedSample.toFixed(2)
                  }
                  hint="per sample sold in range"
                />
              </div>
              <p className="text-xs font-medium text-[#a1a1a1] mb-3">
                New Samples Uploaded
              </p>
              <TrendChart
                data={c.uploadsSeries}
                label="uploads"
                formatValue={fmtInt}
                formatDate={fmtBucketDate}
              />
            </Panel>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Creator Economy">
                <MetricRow
                  label="Average Creator Earnings"
                  hint="creators with sales"
                  value={fmtUsd(ce.avgEarningsUsd)}
                />
                <MetricRow
                  label="Median Creator Earnings"
                  hint="creators with sales"
                  value={fmtUsd(ce.medianEarningsUsd)}
                />
                <MetricRow
                  label="Top Creator Earnings"
                  value={fmtUsd(ce.topEarningsUsd)}
                />
                <MetricRow
                  label="Top-10 Creators"
                  hint="combined"
                  value={fmtUsd(ce.top10EarningsUsd)}
                />
                <MetricRow
                  label="Creators With ≥1 Sale"
                  hint={`${fmtInt(ce.creatorsWithSale)} of ${fmtInt(ce.creatorCount)}`}
                  value={fmtPct(ce.creatorsWithSalePct)}
                />
                <p className="text-[10px] text-[#666] mt-3 leading-snug">
                  Gross earnings in range: credits spent on a creator&apos;s
                  catalog × their payout rate.
                </p>
              </Panel>

              <Panel title="Subscriber Health">
                <MetricRow
                  label="Comped (beta)"
                  hint="active access, no billing"
                  value={fmtInt(sh.compedSubscribers)}
                />
                <MetricRow
                  label="Upgrade Rate"
                  hint={`${fmtInt(sh.upgradeUsers)} of ${fmtInt(sh.activeSubscribers)} paying subscribers`}
                  value={fmtPct(sh.upgradeRatePct)}
                />
                <MetricRow
                  label="Avg Credits Remaining"
                  hint="per active subscriber"
                  value={
                    sh.avgCreditsRemaining == null
                      ? "—"
                      : sh.avgCreditsRemaining.toFixed(1)
                  }
                />
                <p className="text-[10px] text-[#666] mt-3 leading-snug">
                  Upgrade rate counts distinct subscribers with an upgrade
                  top-up in range.
                </p>
              </Panel>
            </div>
          </div>

          {/* Today snapshot sidebar */}
          <Panel
            title="Today Snapshot"
            headerRight={
              <span className="text-[10px] text-[#666] whitespace-nowrap">
                vs yesterday
              </span>
            }
            className="xl:sticky xl:top-4"
          >
            <SnapshotRow
              label="Items Purchased"
              today={data.today.samplesPurchased.today}
              yesterday={data.today.samplesPurchased.yesterday}
              format={fmtInt}
            />
            <SnapshotRow
              label="Royalties Paid"
              today={data.today.royaltiesPaidUsd.today}
              yesterday={data.today.royaltiesPaidUsd.yesterday}
              format={fmtUsd}
            />
            <SnapshotRow
              label="Active Buyers"
              today={data.today.activeBuyers.today}
              yesterday={data.today.activeBuyers.yesterday}
              format={fmtInt}
            />
            <SnapshotRow
              label="Credits Redeemed"
              today={data.today.creditsRedeemed.today}
              yesterday={data.today.creditsRedeemed.yesterday}
              format={fmtInt}
            />
            <SnapshotRow
              label="Samples Uploaded"
              today={data.today.samplesUploaded.today}
              yesterday={data.today.samplesUploaded.yesterday}
              format={fmtInt}
            />
          </Panel>
        </div>

        <p className="text-xs text-[#666]">All metrics shown in USD.</p>
      </div>
    </div>
  );
}

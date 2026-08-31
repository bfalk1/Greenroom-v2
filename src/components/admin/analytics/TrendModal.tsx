"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";
import { TrendChart } from "./TrendChart";
import type {
  ConversionPoint,
  Granularity,
  MetricKey,
  TrendResponse,
} from "./types";

/**
 * Drill-down for one dashboard tile: fetches
 * /api/admin/analytics/trend?metric=…&range=… and renders the full trend
 * with its own range tabs, a definition line, and a summary row. The live
 * metric re-polls itself once a minute while open.
 */

export interface MetricConfig {
  key: MetricKey;
  title: string;
  /** One-line definition shown under the title — what exactly is counted. */
  description: string;
  ranges: { id: string; label: string }[];
  /** How values are formatted (percent = conversion-rate metrics). */
  format: "int" | "percent";
  /** Series noun for the chart tooltip ("users", "purchases"…). */
  tooltipLabel: string;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtPct = (n: number) => `${n.toFixed(n < 1 && n > 0 ? 2 : 1)}%`;

/** Bucket-key formatter matching the server's key conventions. */
export function bucketDateFormatter(granularity: Granularity) {
  return (key: string) => {
    if (granularity === "month") {
      const [y, m] = key.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
    }
    if (granularity === "hour") {
      const [day, hour] = key.split("T");
      const [y, m, d] = day.split("-").map(Number);
      return new Date(y, m - 1, d, Number(hour)).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
      });
    }
    const [y, m, d] = key.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return granularity === "week" ? `Wk of ${label}` : label;
  };
}

function isConversionSeries(
  series: TrendResponse["series"]
): series is ConversionPoint[] {
  return series.length > 0 && "visitors" in series[0];
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[#666]">{label}</p>
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

export function TrendModal({
  config,
  onClose,
}: {
  config: MetricConfig;
  onClose: () => void;
}) {
  const [range, setRange] = useState(config.ranges[0].id);
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal | undefined, silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(
          `/api/admin/analytics/trend?metric=${config.key}&range=${range}`,
          { signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.error === "posthog_not_configured"
              ? "PostHog query API is not configured"
              : body?.error || `Request failed (${res.status})`
          );
        }
        setData((await res.json()) as TrendResponse);
        setError(null);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!silent) {
          setError(e instanceof Error ? e.message : "Failed to load trend");
        }
      } finally {
        if (!signal?.aborted && !silent) setLoading(false);
      }
    },
    [config.key, range]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal, false);
    return () => ctrl.abort();
  }, [load, reloadKey]);

  // The live view keeps itself fresh while open (skipped in background tabs).
  useEffect(() => {
    if (config.key !== "live") return;
    const timer = setInterval(() => {
      if (!document.hidden) void load(undefined, true);
    }, 60_000);
    return () => clearInterval(timer);
  }, [config.key, load]);

  // Esc closes; page scroll is locked while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const formatValue = config.format === "percent" ? fmtPct : fmtInt;
  const series = data?.series ?? [];
  const conversion = data && isConversionSeries(series) ? series : null;
  const chartData = conversion
    ? conversion.map((p) => ({
        date: p.date,
        value: p.value,
        detail: `${fmtInt(p.visitors)} viewed → ${fmtInt(p.conversions)} converted`,
      }))
    : series;

  // Summary row: totals for count metrics, funnel totals for conversions,
  // the current headcount for live.
  let summary: { label: string; value: string }[] = [];
  if (data) {
    if (config.key === "live" && data.live) {
      summary = [
        { label: "Active right now", value: fmtInt(data.live.total) },
        { label: "Signed in", value: fmtInt(data.live.identified) },
        {
          label: "Window",
          value: `last ${data.live.windowMinutes} min`,
        },
      ];
    } else if (conversion) {
      const visitors = conversion.reduce((s, p) => s + p.visitors, 0);
      const conversions = conversion.reduce((s, p) => s + p.conversions, 0);
      summary = [
        { label: "Unique viewers in range", value: fmtInt(visitors) },
        { label: "Conversions", value: fmtInt(conversions) },
        {
          label: "Overall rate",
          value: visitors > 0 ? fmtPct((conversions / visitors) * 100) : "—",
        },
      ];
    } else {
      const values = series
        .map((p) => p.value)
        .filter((v): v is number => v != null);
      const total = values.reduce((s, v) => s + v, 0);
      const peak = values.length ? Math.max(...values) : 0;
      // Averaging a distinct-user count across buckets is meaningful; summing
      // it is not (the same user appears in many buckets).
      const isUniqueUsers = ["dau", "wau", "mau"].includes(config.key);
      summary = [
        ...(isUniqueUsers
          ? []
          : [{ label: "Total in range", value: fmtInt(total) }]),
        {
          label: "Average per bucket",
          value: values.length ? fmtInt(total / values.length) : "—",
        },
        { label: "Peak bucket", value: fmtInt(peak) },
      ];
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${config.title} trend`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 cursor-default"
      />
      <div className="relative w-full max-w-3xl bg-[#141414] border border-[#2a2a2a] rounded-xl shadow-2xl p-5 sm:p-6 max-h-full overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h3 className="text-lg font-semibold text-white">{config.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trend view"
            className="p-1.5 -m-1.5 rounded-lg text-[#a1a1a1] hover:text-white hover:bg-[#242424]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-[#666] mb-4">{config.description}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-1">
            {config.ranges.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
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
          {loading && data && (
            <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />
          )}
        </div>

        {loading && !data ? (
          <div className="h-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg animate-pulse" />
        ) : error ? (
          <div className="h-64 flex flex-col items-center justify-center text-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-6">
            <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-sm text-[#a1a1a1] mb-3">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((n) => n + 1)}
              className="inline-flex items-center gap-1.5 text-sm text-white hover:text-[#39b54a]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : data ? (
          <div className={loading ? "opacity-60 transition-opacity" : ""}>
            <TrendChart
              data={chartData}
              label={config.tooltipLabel}
              formatValue={formatValue}
              formatDate={bucketDateFormatter(data.granularity)}
              heightClass="h-64"
            />
            {summary.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-[#2a2a2a]/60">
                {summary.map((s) => (
                  <SummaryStat key={s.label} label={s.label} value={s.value} />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

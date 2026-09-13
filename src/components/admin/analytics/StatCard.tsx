"use client";

import React from "react";
import { Maximize2 } from "lucide-react";
import { Sparkline } from "./Sparkline";
import type { SeriesPoint } from "./types";

/**
 * Green ▲ / red ▼ percent-change chip. Renders a muted dash when the delta
 * can't be computed (no previous window, or previous value was 0).
 */
export function DeltaChip({
  delta,
  title,
}: {
  delta: number | null | undefined;
  title?: string;
}) {
  if (delta == null || !Number.isFinite(delta)) {
    return (
      <span className="text-[11px] text-[#666]" title={title}>
        —
      </span>
    );
  }
  const up = delta >= 0;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${
        up ? "bg-[#39b54a]/10 text-[#39b54a]" : "bg-red-500/10 text-red-400"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

/** Percent change vs a previous value; null when it can't be computed honestly. */
export function pctDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

interface StatCardProps {
  label: string;
  value: string;
  delta?: number | null;
  /** Tooltip explaining what the delta compares (e.g. "vs previous 30 days"). */
  deltaTitle?: string;
  series?: SeriesPoint[] | null;
  /** Small caption under the sparkline (e.g. proxy-metric disclosure). */
  note?: string;
  /** Makes the card a button that opens the metric's trend drill-down. */
  onClick?: () => void;
  /** Pulsing dot next to the label — for the real-time tile. */
  live?: boolean;
}

/**
 * KPI card: label, big figure, delta chip, static sparkline. With `onClick`
 * it becomes a button (hover ring + expand icon) opening the trend view.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTitle,
  series,
  note,
  onClick,
  live,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#a1a1a1] leading-snug text-left">
          {live && (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39b54a] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#39b54a]" />
            </span>
          )}
          {label}
        </p>
        <DeltaChip delta={delta} title={deltaTitle} />
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none truncate text-left">
        {value}
      </p>
      <div className="mt-auto pt-1">
        {series && series.length > 1 ? (
          <Sparkline data={series} />
        ) : (
          <div className="h-8" aria-hidden="true" />
        )}
        {note && (
          <p className="text-[10px] text-[#666] mt-1 leading-tight text-left">
            {note}
          </p>
        )}
      </div>
    </>
  );

  const baseClass =
    "bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col gap-2 min-w-0";

  if (!onClick) {
    return <div className={baseClass}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="View trend"
      className={`${baseClass} relative group cursor-pointer transition hover:border-[#39b54a]/50 hover:bg-[#1f1f1f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#39b54a]/60`}
    >
      {body}
      <Maximize2
        className="absolute bottom-3 right-3 w-3 h-3 text-[#666] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden="true"
      />
    </button>
  );
}

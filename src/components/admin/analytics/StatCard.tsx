"use client";

import React from "react";
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
}

/** KPI card: label, big figure, delta chip, static sparkline. */
export function StatCard({
  label,
  value,
  delta,
  deltaTitle,
  series,
  note,
}: StatCardProps) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[#a1a1a1] leading-snug">{label}</p>
        <DeltaChip delta={delta} title={deltaTitle} />
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none truncate">
        {value}
      </p>
      <div className="mt-auto pt-1">
        {series && series.length > 1 ? (
          <Sparkline data={series} />
        ) : (
          <div className="h-8" aria-hidden="true" />
        )}
        {note && (
          <p className="text-[10px] text-[#666] mt-1 leading-tight">{note}</p>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useId, useState } from "react";
import { Calendar } from "lucide-react";
import type { SeriesPoint } from "./types";

interface TrendChartProps {
  data: SeriesPoint[];
  /** Series name shown in the tooltip (e.g. "purchases"). */
  label: string;
  formatValue: (v: number) => string;
  formatDate: (key: string) => string;
  /** Tailwind height class for the SVG (default h-44). */
  heightClass?: string;
}

/**
 * Line+area chart with hover tooltip, modeled on creator/EarningsChart.
 * Hover targets are full-height invisible columns so dense series (90 daily
 * points) stay easy to inspect; visible dots only appear on sparse series.
 * null values are "no data" and render as line gaps rather than dips to 0.
 */
export function TrendChart({
  data,
  label,
  formatValue,
  formatDate,
  heightClass = "h-44",
}: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = `trend-${useId().replace(/:/g, "")}`;

  if (!data || data.length === 0) {
    return (
      <div className={`${heightClass} flex items-center justify-center text-[#666] text-sm`}>
        <Calendar className="w-4 h-4 mr-2" />
        No data in range
      </div>
    );
  }

  const STEP = 20;
  const W = Math.max(data.length * STEP, STEP);
  const H = 120;
  const PLOT = 100;
  const max = Math.max(
    ...data.map((d) => d.value).filter((v): v is number => v != null),
    1
  );
  const x = (i: number) =>
    data.length === 1 ? W / 2 : i * STEP + STEP / 2;
  const y = (v: number) => PLOT - (v / max) * (PLOT - 10);

  // Contiguous runs of non-null indices — each run is its own subpath so
  // null buckets show as gaps.
  const segments: number[][] = [];
  let run: number[] = [];
  data.forEach((d, i) => {
    if (d.value == null) {
      if (run.length) segments.push(run);
      run = [];
    } else {
      run.push(i);
    }
  });
  if (run.length) segments.push(run);

  const pt = (i: number) => `${x(i)} ${y(data[i].value as number)}`;
  const line = segments
    .map((seg) => seg.map((i, j) => `${j === 0 ? "M" : "L"} ${pt(i)}`).join(" "))
    .join(" ");
  const area = segments
    .map(
      (seg) =>
        `M ${x(seg[0])} ${PLOT} ${seg
          .map((i) => `L ${pt(i)}`)
          .join(" ")} L ${x(seg[seg.length - 1])} ${PLOT} Z`
    )
    .join(" ");

  // Keep the tooltip inside the container near the edges.
  const tooltipLeftPct =
    data.length === 1
      ? 50
      : Math.min(92, Math.max(8, (hoveredIndex ?? 0) / (data.length - 1) * 100));
  const showDots = data.length <= 40;
  const hovered = hoveredIndex !== null ? data[hoveredIndex] : undefined;

  return (
    <div className="relative">
      {hovered && (
        <div
          className="absolute z-10 -top-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm pointer-events-none shadow-lg whitespace-nowrap"
          style={{
            left: `${tooltipLeftPct}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-white font-medium tabular-nums">
            {hovered.value == null ? "—" : formatValue(hovered.value)}{" "}
            <span className="text-[#a1a1a1] text-xs font-normal">{label}</span>
          </div>
          <div className="text-[#666] text-xs">{formatDate(hovered.date)}</div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${heightClass}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#39b54a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#39b54a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((gy) => (
          <line
            key={gy}
            x1="0"
            y1={PLOT - gy}
            x2={W}
            y2={PLOT - gy}
            stroke="#2a2a2a"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} opacity="0.3" />
        <path
          d={line}
          fill="none"
          stroke="#39b54a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {showDots &&
          data.map((d, i) =>
            d.value == null ? null : (
              <circle
                key={i}
                cx={x(i)}
                cy={y(d.value)}
                r={hoveredIndex === i ? 5 : 3}
                fill={hoveredIndex === i ? "#39b54a" : "#1a1a1a"}
                stroke="#39b54a"
                strokeWidth="2"
                className="pointer-events-none transition-all"
              />
            )
          )}

        {!showDots && hoveredIndex !== null && hovered && hovered.value != null && (
          <circle
            cx={x(hoveredIndex)}
            cy={y(hovered.value)}
            r={5}
            fill="#39b54a"
            stroke="#0a0a0a"
            strokeWidth="2"
            className="pointer-events-none"
          />
        )}

        {/* Full-height invisible hover columns */}
        {data.map((_, i) => (
          <rect
            key={`hover-${i}`}
            x={i * STEP}
            y={0}
            width={STEP}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
          />
        ))}
      </svg>

      <div className="flex justify-between mt-2 text-xs text-[#666] px-1">
        <span>{formatDate(data[0].date)}</span>
        {data.length > 2 && (
          <span>{formatDate(data[Math.floor(data.length / 2)].date)}</span>
        )}
        <span>{formatDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

"use client";

import React, { useId } from "react";

interface SparklineProps {
  data: { date: string; value: number | null }[];
  className?: string;
}

/**
 * Static mini line+area chart for KPI cards. No hover, no axes — just shape.
 * null values are "no data" and render as gaps rather than dips to 0.
 * Renders an empty slot of the same size when there's nothing to draw, so KPI
 * cards never shift.
 */
export function Sparkline({ data, className = "h-8 w-full" }: SparklineProps) {
  // useId can contain ":" which breaks url(#...) references — strip it.
  const gradientId = `spark-${useId().replace(/:/g, "")}`;

  const values = (data ?? [])
    .map((d) => d.value)
    .filter((v): v is number => v != null);
  if (!data || data.length < 2 || values.length === 0) {
    return <div className={className} aria-hidden="true" />;
  }

  const W = 120;
  const H = 36;
  const PAD = 3;
  const max = Math.max(...values);
  const n = data.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) =>
    max <= 0 ? H - PAD : H - PAD - (v / max) * (H - PAD * 2);

  // One continuous path through the buckets that have values — same rule as
  // TrendChart, so a tile's sparkline has the same shape as its drill-down.
  const filled = data
    .map((d, i) => ({ i, v: d.value }))
    .filter((p): p is { i: number; v: number } => p.v != null);

  const pt = (p: { i: number; v: number }) =>
    `${x(p.i).toFixed(2)} ${y(p.v).toFixed(2)}`;
  const line = filled.map((p, j) => `${j === 0 ? "M" : "L"} ${pt(p)}`).join(" ");
  const area = filled.length
    ? `M ${x(filled[0].i).toFixed(2)} ${H} ${filled
        .map((p) => `L ${pt(p)}`)
        .join(" ")} L ${x(filled[filled.length - 1].i).toFixed(2)} ${H} Z`
    : "";
  // A lone point draws no line — mark it so it isn't invisible.
  const singletons = filled.length === 1 ? [filled[0].i] : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#39b54a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#39b54a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#39b54a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {singletons.map((i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(data[i].value as number)}
          r={1.5}
          fill="#39b54a"
        />
      ))}
    </svg>
  );
}

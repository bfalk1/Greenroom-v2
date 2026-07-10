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

  const pt = (i: number) =>
    `${x(i).toFixed(2)} ${y(data[i].value as number).toFixed(2)}`;
  const line = segments
    .map((seg) => seg.map((i, j) => `${j === 0 ? "M" : "L"} ${pt(i)}`).join(" "))
    .join(" ");
  const area = segments
    .map(
      (seg) =>
        `M ${x(seg[0]).toFixed(2)} ${H} ${seg
          .map((i) => `L ${pt(i)}`)
          .join(" ")} L ${x(seg[seg.length - 1]).toFixed(2)} ${H} Z`
    )
    .join(" ");
  // A run of one point draws no line — mark it with a dot so it isn't invisible.
  const singletons = segments.filter((seg) => seg.length === 1).map((seg) => seg[0]);

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

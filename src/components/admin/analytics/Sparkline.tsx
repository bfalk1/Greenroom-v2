"use client";

import React, { useId } from "react";

interface SparklineProps {
  data: { date: string; value: number }[];
  className?: string;
}

/**
 * Static mini line+area chart for KPI cards. No hover, no axes — just shape.
 * Renders an empty slot of the same size when there's nothing to draw, so KPI
 * cards never shift.
 */
export function Sparkline({ data, className = "h-8 w-full" }: SparklineProps) {
  // useId can contain ":" which breaks url(#...) references — strip it.
  const gradientId = `spark-${useId().replace(/:/g, "")}`;

  if (!data || data.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const W = 120;
  const H = 36;
  const PAD = 3;
  const max = Math.max(...data.map((d) => d.value));
  const n = data.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) =>
    max <= 0 ? H - PAD : H - PAD - (v / max) * (H - PAD * 2);

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(d.value).toFixed(2)}`)
    .join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

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
    </svg>
  );
}

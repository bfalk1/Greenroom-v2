"use client";

import React, { useState, useEffect } from "react";
import { Loader2, TrendingUp, Calendar } from "lucide-react";

interface HistoryPoint {
  date: string;
  credits: number;
  earnings: number;
  sales: number;
}

type Period = "day" | "week" | "month";

export function EarningsChart() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/creator/earnings/history?period=${period}`)
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.history || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  const maxEarnings = Math.max(...history.map((h) => h.earnings), 1);
  const totalEarnings = history.reduce((sum, h) => sum + h.earnings, 0);
  const totalSales = history.reduce((sum, h) => sum + h.sales, 0);

  const formatDate = (dateStr: string) => {
    if (period === "month") {
      const [year, month] = dateStr.split("-");
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00FF88]/10 rounded-lg">
            <TrendingUp className="w-5 h-5 text-[#00FF88]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Earnings History</h3>
            <p className="text-sm text-[#a1a1a1]">
              ${totalEarnings.toFixed(2)} from {totalSales} sales
            </p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex gap-1 bg-[#0a0a0a] rounded-lg p-1">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                period === p
                  ? "bg-[#00FF88] text-black font-medium"
                  : "text-[#a1a1a1] hover:text-white"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {history.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-[#666]">
          <Calendar className="w-5 h-5 mr-2" />
          No earnings data yet
        </div>
      ) : (
        <div className="relative">
          {/* Tooltip */}
          {hoveredIndex !== null && history[hoveredIndex] && (
            <div
              className="absolute z-10 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm pointer-events-none shadow-lg"
              style={{
                left: `${(hoveredIndex / (history.length - 1)) * 100}%`,
                transform: "translateX(-50%)",
                top: "-60px",
              }}
            >
              <div className="text-white font-medium">${history[hoveredIndex].earnings.toFixed(2)}</div>
              <div className="text-[#a1a1a1] text-xs">{history[hoveredIndex].sales} sales</div>
              <div className="text-[#666] text-xs">{formatDate(history[hoveredIndex].date)}</div>
            </div>
          )}

          {/* SVG Chart */}
          <svg
            viewBox={`0 0 ${history.length * 20} 120`}
            className="w-full h-48"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={100 - y}
                x2={history.length * 20}
                y2={100 - y}
                stroke="#2a2a2a"
                strokeWidth="1"
              />
            ))}

            {/* Area fill */}
            <path
              d={`
                M 0 100
                ${history.map((h, i) => `L ${i * 20 + 10} ${100 - (h.earnings / maxEarnings) * 90}`).join(" ")}
                L ${(history.length - 1) * 20 + 10} 100
                Z
              `}
              fill="url(#gradient)"
              opacity="0.3"
            />

            {/* Line */}
            <path
              d={history.map((h, i) => `${i === 0 ? "M" : "L"} ${i * 20 + 10} ${100 - (h.earnings / maxEarnings) * 90}`).join(" ")}
              fill="none"
              stroke="#00FF88"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {history.map((h, i) => (
              <circle
                key={i}
                cx={i * 20 + 10}
                cy={100 - (h.earnings / maxEarnings) * 90}
                r={hoveredIndex === i ? 6 : 4}
                fill={hoveredIndex === i ? "#00FF88" : "#1a1a1a"}
                stroke="#00FF88"
                strokeWidth="2"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            ))}

            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00FF88" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2 text-xs text-[#666] px-2">
            {history.length > 0 && (
              <>
                <span>{formatDate(history[0].date)}</span>
                {history.length > 2 && (
                  <span>{formatDate(history[Math.floor(history.length / 2)].date)}</span>
                )}
                <span>{formatDate(history[history.length - 1].date)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

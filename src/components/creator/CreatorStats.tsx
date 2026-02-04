"use client";

import React from "react";
import { Music, Download, DollarSign, TrendingUp } from "lucide-react";

interface CreatorStatsProps {
  totalSamples: number;
  totalDownloads: number;
  totalEarnings: number;
  totalPurchases: number;
}

export function CreatorStats({
  totalSamples,
  totalDownloads,
  totalEarnings,
  totalPurchases,
}: CreatorStatsProps) {
  const stats = [
    {
      label: "Samples",
      value: totalSamples,
      icon: Music,
      color: "#00FF88",
    },
    {
      label: "Downloads",
      value: totalDownloads,
      icon: Download,
      color: "#00FF88",
    },
    {
      label: "Purchases",
      value: totalPurchases,
      icon: TrendingUp,
      color: "#00FF88",
    },
    {
      label: "Earnings",
      value: `$${totalEarnings.toFixed(2)}`,
      icon: DollarSign,
      color: "#00FF88",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div
            key={idx}
            className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#a1a1a1]">
                {stat.label}
              </h3>
              <Icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        );
      })}
    </div>
  );
}

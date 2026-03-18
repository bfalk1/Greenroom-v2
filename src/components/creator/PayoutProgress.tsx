"use client";

import React from "react";
import { Info, CheckCircle2 } from "lucide-react";

interface PayoutProgressProps {
  currentEarnings: number;
  threshold: number;
  estimatedMonthlyRevenue: number;
  availableBalance: number;
  pendingPayout: number;
}

export function PayoutProgress({
  currentEarnings,
  threshold,
  estimatedMonthlyRevenue,
  availableBalance,
  pendingPayout,
}: PayoutProgressProps) {
  const thresholdMet = currentEarnings >= threshold;
  const progressPercent = Math.min((currentEarnings / threshold) * 100, 100);
  
  // Get current month name
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-white font-semibold">Payout Threshold</h3>
        <div className="group relative">
          <Info className="w-4 h-4 text-[#666] cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-xs text-[#a1a1a1] opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
            Minimum earnings required to request a payout
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
        {/* Current Progress Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-white mb-2">Current Progress</h4>
            {thresholdMet ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#39b54a]/20 text-[#39b54a] text-xs font-medium rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                THRESHOLD MET
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 bg-[#2a2a2a] text-[#a1a1a1] text-xs font-medium rounded-full">
                ${(threshold - currentEarnings).toFixed(2)} to go
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-white">
              ${currentEarnings.toFixed(2)}
            </span>
            <span className="text-lg text-[#666]"> / ${threshold.toFixed(2)}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-[#2a2a2a] rounded-full overflow-hidden mb-6">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercent}%`,
              background: thresholdMet
                ? "linear-gradient(90deg, #39b54a 0%, #2e9140 100%)"
                : "linear-gradient(90deg, #8B5CF6 0%, #A78BFA 50%, #C4B5FD 100%)",
            }}
          />
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA]" />
              <span className="text-[#a1a1a1] text-sm">Estimated Revenue for {currentMonth}</span>
            </div>
            <span className="text-white font-medium">${estimatedMonthlyRevenue.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-[#C4B5FD] to-[#DDD6FE]" />
              <span className="text-[#a1a1a1] text-sm flex items-center gap-1.5">
                Available balance
                <div className="group relative">
                  <Info className="w-3.5 h-3.5 text-[#666] cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-xs text-[#a1a1a1] opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                    Total unpaid minus pending payouts
                  </div>
                </div>
              </span>
            </div>
            <span className="text-white font-medium">${availableBalance.toFixed(2)}</span>
          </div>

          {pendingPayout > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-yellow-500/50" />
                <span className="text-[#a1a1a1] text-sm">Pending payout</span>
              </div>
              <span className="text-yellow-400 font-medium">${pendingPayout.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

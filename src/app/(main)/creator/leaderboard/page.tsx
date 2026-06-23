"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Crown,
  Upload,
  Coins,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

interface LeaderboardRow {
  creatorId: string;
  displayName: string;
  avatarUrl: string | null;
  uploads: number;
  salesCredits: number;
}

type SortBy = "sales" | "uploads";

// Gold / silver / bronze accents for the top three ranks.
const RANK_COLORS: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

function Avatar({ row }: { row: LeaderboardRow }) {
  if (row.avatarUrl) {
    return (
      <img
        src={row.avatarUrl}
        alt={row.displayName}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-semibold text-[#a1a1a1]">
        {row.displayName.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export default function CreatorLeaderboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("sales");
  // 0 = current month, 1 = last month, ...
  const [offset, setOffset] = useState(0);

  const monthParam = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [offset]);

  const isCreator = user?.role === "CREATOR" || user?.role === "ADMIN";

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/creator/leaderboard?month=${monthParam}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setRows(data.rows);
      setMonthLabel(data.monthLabel);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      toast.error("Failed to load the leaderboard");
    } finally {
      setLoading(false);
    }
  }, [monthParam]);

  useEffect(() => {
    if (user && isCreator) {
      fetchLeaderboard();
    } else if (!userLoading && !isCreator) {
      setLoading(false);
    }
  }, [user, userLoading, isCreator, fetchLeaderboard]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      sortBy === "sales"
        ? b.salesCredits - a.salesCredits || b.uploads - a.uploads
        : b.uploads - a.uploads || b.salesCredits - a.salesCredits
    );
    return copy;
  }, [rows, sortBy]);

  const myIndex = useMemo(
    () => sortedRows.findIndex((r) => r.creatorId === user?.id),
    [sortedRows, user?.id]
  );
  const myRow = myIndex >= 0 ? sortedRows[myIndex] : null;

  if (userLoading || (loading && isCreator)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (!isCreator) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">
            Creator Access Required
          </h2>
          <p className="text-[#a1a1a1] mb-4">
            The leaderboard is available to creators.
          </p>
          <Button
            onClick={() => router.push("/marketplace")}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            Browse Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="w-7 h-7 text-[#39b54a]" />
          <h1 className="text-3xl font-bold text-white">Creator Leaderboard</h1>
        </div>
        <p className="text-[#a1a1a1] mb-6">
          Top creators by sales and uploads — resets every month.
        </p>

        {/* Month navigation + sort toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOffset((o) => o + 1)}
              className="h-8 w-8 p-0 text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
              title="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-sm font-medium text-white min-w-[140px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={offset === 0}
              className="h-8 w-8 p-0 text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] disabled:opacity-30"
              title="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] self-start">
            <button
              onClick={() => setSortBy("sales")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                sortBy === "sales"
                  ? "bg-[#39b54a] text-black"
                  : "text-[#a1a1a1] hover:text-white"
              }`}
            >
              <Coins className="w-4 h-4" />
              Top Sellers
            </button>
            <button
              onClick={() => setSortBy("uploads")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                sortBy === "uploads"
                  ? "bg-[#39b54a] text-black"
                  : "text-[#a1a1a1] hover:text-white"
              }`}
            >
              <Upload className="w-4 h-4" />
              Top Uploaders
            </button>
          </div>
        </div>

        {/* Your rank */}
        {myRow ? (
          <div className="mb-6 p-4 rounded-lg bg-[#39b54a]/10 border border-[#39b54a]/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#39b54a]/20 flex items-center justify-center">
                <span className="text-sm font-bold text-[#39b54a]">
                  #{myIndex + 1}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Your rank this month
                </p>
                <p className="text-xs text-[#a1a1a1]">
                  {myRow.salesCredits.toLocaleString()} credits ·{" "}
                  {myRow.uploads} upload{myRow.uploads === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <p className="text-sm text-[#a1a1a1]">
              You haven&apos;t uploaded or sold anything this month yet — get on
              the board!
            </p>
          </div>
        )}

        {/* Leaderboard */}
        {sortedRows.length > 0 ? (
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[3rem_1fr_6rem_7rem] sm:grid-cols-[4rem_1fr_8rem_9rem] gap-2 px-4 py-3 border-b border-[#2a2a2a] text-xs font-medium uppercase tracking-wide text-[#666]">
              <span>Rank</span>
              <span>Creator</span>
              <span
                className={`text-right ${
                  sortBy === "uploads" ? "text-[#39b54a]" : ""
                }`}
              >
                Uploads
              </span>
              <span
                className={`text-right ${
                  sortBy === "sales" ? "text-[#39b54a]" : ""
                }`}
              >
                Credits
              </span>
            </div>

            <div className="divide-y divide-[#2a2a2a]">
              {sortedRows.map((row, i) => {
                const rank = i + 1;
                const isMe = row.creatorId === user?.id;
                const rankColor = RANK_COLORS[rank];
                return (
                  <div
                    key={row.creatorId}
                    className={`grid grid-cols-[3rem_1fr_6rem_7rem] sm:grid-cols-[4rem_1fr_8rem_9rem] gap-2 px-4 py-3 items-center transition ${
                      isMe ? "bg-[#39b54a]/5" : "hover:bg-[#222]"
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex items-center">
                      {rank === 1 ? (
                        <Crown
                          className="w-5 h-5"
                          style={{ color: rankColor }}
                          fill={rankColor}
                        />
                      ) : (
                        <span
                          className="text-sm font-bold"
                          style={{ color: rankColor ?? "#a1a1a1" }}
                        >
                          {rank}
                        </span>
                      )}
                    </div>

                    {/* Creator */}
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar row={row} />
                      <span className="truncate text-sm font-medium text-white">
                        {row.displayName}
                        {isMe && (
                          <span className="ml-2 text-xs text-[#39b54a]">
                            (you)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Uploads */}
                    <span
                      className={`text-right text-sm tabular-nums ${
                        sortBy === "uploads"
                          ? "font-semibold text-white"
                          : "text-[#a1a1a1]"
                      }`}
                    >
                      {row.uploads.toLocaleString()}
                    </span>

                    {/* Credits */}
                    <span
                      className={`text-right text-sm tabular-nums ${
                        sortBy === "sales"
                          ? "font-semibold text-white"
                          : "text-[#a1a1a1]"
                      }`}
                    >
                      {row.salesCredits.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Trophy className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              No activity yet
            </h3>
            <p className="text-[#a1a1a1]">
              No uploads or sales for {monthLabel}. Be the first on the board.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

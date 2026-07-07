"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  User,
  Loader2,
  Check,
  X,
  Percent,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface Creator {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  avatarUrl: string | null;
  customPayoutRate: number | null;
  publishedSamples: number;
}

const PAGE_SIZE = 25;

// Rates are CENTS PER CREDIT (7 = $0.07/credit), not percentages.
function parseRate(value: string): number | "invalid" {
  const rate = parseInt(value, 10);
  if (isNaN(rate) || rate < 0 || rate > 50) return "invalid";
  return rate;
}

export default function CreatorPayoutSettings() {
  // Global (platform default) rate
  const [globalRate, setGlobalRate] = useState<number | null>(null);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalDraft, setGlobalDraft] = useState("");
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Creator list
  const [creators, setCreators] = useState<Creator[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Ignore responses from superseded fetches (e.g. rapid search changes)
  const fetchSeq = useRef(0);

  // Per-row editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setGlobalRate(data.settings?.creatorPayoutRate ?? null);
      } catch {
        toast.error("Failed to load platform settings");
      }
    };
    loadSettings();
  }, []);

  // Debounce the search box into the actual query term
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchCreators = useCallback(
    async (offset: number, append: boolean) => {
      const seq = ++fetchSeq.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (search) params.set("search", search);
        const res = await fetch(`/api/admin/creators?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (seq !== fetchSeq.current) return;
        setCreators((prev) =>
          append ? [...prev, ...data.creators] : data.creators
        );
        setTotal(data.total);
      } catch {
        if (seq === fetchSeq.current) toast.error("Failed to load creators");
      } finally {
        if (seq === fetchSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search]
  );

  useEffect(() => {
    fetchCreators(0, false);
  }, [fetchCreators]);

  const handleSaveGlobal = async () => {
    const rate = parseRate(globalDraft);
    if (rate === "invalid") {
      toast.error("Payout rate must be between 0 and 50 cents per credit");
      return;
    }
    setSavingGlobal(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorPayoutRate: rate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error);
      }
      setGlobalRate(rate);
      setEditingGlobal(false);
      toast.success("Platform payout rate updated");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Failed to update platform payout rate"
      );
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveCreatorRate = async (
    creatorId: string,
    rate: number | null
  ) => {
    const previous = creators;
    // Optimistic update; reverted on failure
    setCreators((prev) =>
      prev.map((c) =>
        c.id === creatorId ? { ...c, customPayoutRate: rate } : c
      )
    );
    setEditingId(null);
    setSavingId(creatorId);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPayoutRate: rate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error);
      }
      toast.success(
        rate === null
          ? "Override cleared — using platform default"
          : "Payout rate updated"
      );
    } catch (error) {
      setCreators(previous);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Failed to update payout rate"
      );
    } finally {
      setSavingId(null);
    }
  };

  const startRowEdit = (creator: Creator) => {
    setEditingId(creator.id);
    setRateDraft(
      creator.customPayoutRate !== null
        ? String(creator.customPayoutRate)
        : String(globalRate ?? "")
    );
  };

  const submitRowEdit = (creatorId: string) => {
    const rate = parseRate(rateDraft);
    if (rate === "invalid") {
      toast.error("Payout rate must be between 0 and 50 cents per credit");
      return;
    }
    handleSaveCreatorRate(creatorId, rate);
  };

  return (
    <div className="space-y-6">
      {/* Global rate header */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#39b54a]/10 rounded-lg">
              <Percent className="w-5 h-5 text-[#39b54a]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Creator Payout Rates
              </h3>
              <p className="text-sm text-[#a1a1a1]">
                Platform default applies to every creator without a custom
                override
              </p>
            </div>
          </div>

          {editingGlobal ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="50"
                value={globalDraft}
                onChange={(e) => setGlobalDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveGlobal()}
                className="w-20 bg-[#0a0a0a] border-[#2a2a2a] text-white text-center"
                autoFocus
              />
              <span className="text-sm text-[#a1a1a1]">¢/credit</span>
              <Button
                onClick={handleSaveGlobal}
                disabled={savingGlobal}
                size="sm"
                className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                {savingGlobal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </Button>
              <Button
                onClick={() => setEditingGlobal(false)}
                disabled={savingGlobal}
                size="sm"
                variant="outline"
                className="border-[#2a2a2a]"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (globalRate === null) return;
                setGlobalDraft(String(globalRate));
                setEditingGlobal(true);
              }}
              disabled={globalRate === null}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] transition disabled:opacity-50"
            >
              <span className="text-sm text-[#a1a1a1]">Default:</span>
              <span className="text-white font-semibold">
                {globalRate !== null ? (
                  `${globalRate}¢/credit ($${(globalRate / 100).toFixed(2)})`
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                )}
              </span>
              <Pencil className="w-3.5 h-3.5 text-[#a1a1a1]" />
            </button>
          )}
        </div>
      </div>

      {/* Creator list */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-white">Artists</h4>
            <span className="text-sm text-[#666]">({total})</span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a1a1a1]" />
            <Input
              type="text"
              placeholder="Search by artist, username, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 bg-[#0a0a0a] border-[#2a2a2a] text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
          </div>
        ) : creators.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-12 h-12 text-[#2a2a2a] mx-auto mb-3" />
            <p className="text-[#a1a1a1]">
              {search ? "No creators match your search" : "No creators yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#666] border-b border-[#2a2a2a]">
                    <th className="py-2 pr-4 font-medium">Artist</th>
                    <th className="py-2 pr-4 font-medium">Published</th>
                    <th className="py-2 pr-4 font-medium">Effective rate</th>
                    <th className="py-2 pr-4 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((creator) => {
                    const isCustom = creator.customPayoutRate !== null;
                    const effectiveRate = isCustom
                      ? creator.customPayoutRate
                      : globalRate;
                    return (
                      <tr
                        key={creator.id}
                        className="border-b border-[#2a2a2a]/60 hover:bg-[#0a0a0a] transition"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {creator.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={creator.avatarUrl}
                                  alt=""
                                  className="w-8 h-8 object-cover"
                                />
                              ) : (
                                <User className="w-4 h-4 text-[#a1a1a1]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate max-w-[220px]">
                                {creator.artistName ||
                                  creator.username ||
                                  "—"}
                              </p>
                              <p className="text-xs text-[#a1a1a1] truncate max-w-[220px]">
                                {creator.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[#a1a1a1]">
                          {creator.publishedSamples}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {effectiveRate !== null
                                ? `${effectiveRate}¢/credit`
                                : "—"}
                            </span>
                            {isCustom ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                custom
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#2a2a2a] text-[#a1a1a1] border border-[#2a2a2a]">
                                default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center justify-end gap-2">
                            {editingId === creator.id ? (
                              <>
                                <Input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={rateDraft}
                                  onChange={(e) =>
                                    setRateDraft(e.target.value)
                                  }
                                  onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    submitRowEdit(creator.id)
                                  }
                                  className="w-16 h-8 bg-[#0a0a0a] border-[#2a2a2a] text-white text-center"
                                  autoFocus
                                />
                                <Button
                                  onClick={() => submitRowEdit(creator.id)}
                                  size="sm"
                                  className="h-8 bg-[#39b54a] text-black hover:bg-[#2e9140]"
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  onClick={() => setEditingId(null)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-[#2a2a2a]"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            ) : savingId === creator.id ? (
                              <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />
                            ) : (
                              <>
                                <Button
                                  onClick={() => startRowEdit(creator)}
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-[#2a2a2a] text-[#a1a1a1] hover:text-white"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                {isCustom && (
                                  <Button
                                    onClick={() =>
                                      handleSaveCreatorRate(creator.id, null)
                                    }
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-[#2a2a2a] text-[#a1a1a1] hover:text-white"
                                    title="Clear override (use platform default)"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {creators.length < total && (
              <div className="flex justify-center mt-4">
                <Button
                  onClick={() => fetchCreators(creators.length, true)}
                  disabled={loadingMore}
                  variant="outline"
                  className="border-[#2a2a2a] text-[#a1a1a1] hover:text-white"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    `Load more (${creators.length} of ${total})`
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

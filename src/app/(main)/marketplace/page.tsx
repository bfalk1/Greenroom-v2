"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, Music, Loader2, Users, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SampleCard, Sample } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const PAGE_SIZE = 20;

export default function MarketplacePage() {
  const { user, refreshUser } = useUser();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [followingSamples, setFollowingSamples] = useState<Sample[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    genre: "all",
    sampleType: "all",
    key: "all",
    sortBy: "popular",
  });

  const fetchSamples = useCallback(
    async (offset = 0, append = false) => {
      try {
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (filters.genre !== "all") params.set("genre", filters.genre);
        if (filters.sampleType !== "all") params.set("sampleType", filters.sampleType);
        if (filters.key !== "all") params.set("key", filters.key);
        params.set("sortBy", filters.sortBy);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`/api/samples?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch samples");

        const data = await res.json();

        if (append) {
          setSamples((prev) => [...prev, ...data.samples]);
        } else {
          setSamples(data.samples);
        }
        setTotal(data.total);
      } catch (error) {
        console.error("Error fetching samples:", error);
        toast.error("Failed to load samples");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [searchQuery, filters]
  );

  const fetchFollowingSamples = useCallback(async () => {
    if (!user) {
      setFollowingSamples([]);
      setFollowingCount(0);
      return;
    }
    
    try {
      setLoadingFollowing(true);
      const res = await fetch("/api/samples/following?limit=6");
      if (res.ok) {
        const data = await res.json();
        setFollowingSamples(data.samples || []);
        setFollowingCount(data.following || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingFollowing(false);
    }
  }, [user]);

  const fetchPurchases = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/purchases");
      if (res.ok) {
        const data = await res.json();
        setPurchasedIds(new Set(data.sampleIds));
      }
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    fetchSamples(0, false);
  }, [fetchSamples]);

  useEffect(() => {
    fetchFollowingSamples();
  }, [fetchFollowingSamples]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSamples(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters]);

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  const handleLoadMore = () => {
    fetchSamples(samples.length, true);
  };

  const handlePurchase = async (sample: Sample) => {
    if (!user) {
      toast.error("Please log in to purchase samples");
      return;
    }

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Purchase failed");
      }

      // Update purchased set
      setPurchasedIds((prev) => new Set([...prev, sample.id]));
      // Refresh user credits
      refreshUser();
      toast.success(`Purchased "${sample.name}" 🎵`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase failed";
      toast.error(message);
    }
  };

  const userForCard = user
    ? {
        id: user.id,
        email: user.email,
        credits: user.credits,
        subscription_status: user.subscription_status,
        is_creator: user.is_creator,
        role: user.role,
      }
    : null;

  // Check if we're in a filtered/search state
  const isFiltered = searchQuery || filters.genre !== "all" || filters.sampleType !== "all" || filters.key !== "all";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#a1a1a1]" />
            <Input
              type="text"
              placeholder="Search samples, creators, genres..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
            />
          </div>
        </div>

        {/* For You Section - Only show when not searching/filtering and user has follows */}
        {!isFiltered && user && followingSamples.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#00FF88]/10 rounded-lg">
                  <Users className="w-5 h-5 text-[#00FF88]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">For You</h2>
                  <p className="text-xs text-[#a1a1a1]">
                    New from {followingCount} artist{followingCount !== 1 ? "s" : ""} you follow
                  </p>
                </div>
              </div>
              <Link href="/following">
                <Button
                  variant="ghost"
                  className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
                >
                  See all
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>

            {loadingFollowing ? (
              <div className="space-y-2">
                {Array(3)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-20 bg-[#1a1a1a] rounded-lg animate-pulse"
                    />
                  ))}
              </div>
            ) : (
              <div className="space-y-2 pb-6 border-b border-[#2a2a2a]">
                {followingSamples.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    user={userForCard}
                    isOwned={purchasedIds.has(sample.id)}
                    onPurchase={handlePurchase}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt to follow artists if user is logged in but not following anyone */}
        {!isFiltered && user && followingCount === 0 && !loadingFollowing && (
          <div className="mb-10 p-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#00FF88]/10 rounded-full">
                <Users className="w-6 h-6 text-[#00FF88]" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">Discover Artists</h3>
                <p className="text-sm text-[#a1a1a1]">
                  Follow your favorite creators to get personalized recommendations right here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <SampleFilters onFilterChange={handleFilterChange} />

        {/* Results */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#a1a1a1] mb-4">
            {isFiltered ? `${total} result${total !== 1 ? "s" : ""}` : `${total} sample${total !== 1 ? "s" : ""}`}
          </h2>

          {loading ? (
            <div className="space-y-2">
              {Array(8)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="h-20 bg-[#1a1a1a] rounded-lg animate-pulse"
                  />
                ))}
            </div>
          ) : samples.length > 0 ? (
            <div className="space-y-2">
              {samples.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  user={userForCard}
                  isOwned={purchasedIds.has(sample.id)}
                  onPurchase={handlePurchase}
                />
              ))}

              {/* Load More */}
              {samples.length < total && (
                <div className="flex justify-center pt-6">
                  <Button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    variant="outline"
                    className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a] px-8"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      `Load More (${samples.length} of ${total})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
              <p className="text-[#a1a1a1]">
                No samples found matching your filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

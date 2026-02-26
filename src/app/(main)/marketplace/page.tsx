"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Loader2, Users, ChevronRight, Heart, CheckSquare, Square, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SampleCard, Sample, toggleGlobalPlay, stopGlobalPlayback } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
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
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({
    genre: "all",
    instrumentType: "all",
    sampleType: "all",
    key: "all",
    sortBy: "popular",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPurchasing, setBulkPurchasing] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSelectableSamples = () => {
    return samples.filter(s => !purchasedIds.has(s.id));
  };

  const selectAllUnowned = () => {
    const selectable = getSelectableSamples();
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(s => s.id)));
    }
  };

  const handleBulkPurchase = async () => {
    if (selectedIds.size === 0 || !user) return;
    
    const selectedSamples = samples.filter(s => selectedIds.has(s.id) && !purchasedIds.has(s.id));
    const totalCost = selectedSamples.reduce((sum, s) => sum + s.credit_price, 0);
    
    if ((user.credits || 0) < totalCost) {
      toast.error(`Not enough credits. Need ${totalCost}, have ${user.credits || 0}`);
      return;
    }
    
    setBulkPurchasing(true);
    let successCount = 0;
    
    for (const sample of selectedSamples) {
      try {
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sampleId: sample.id }),
        });
        
        if (res.ok) {
          successCount++;
          setPurchasedIds(prev => new Set([...prev, sample.id]));
        }
      } catch (error) {
        console.error(`Failed to purchase ${sample.name}:`, error);
      }
    }
    
    if (successCount > 0) {
      toast.success(`Purchased ${successCount} samples!`);
      refreshUser();
      setSelectedIds(new Set());
    }
    
    setBulkPurchasing(false);
  };

  const selectedCost = samples
    .filter(s => selectedIds.has(s.id) && !purchasedIds.has(s.id))
    .reduce((sum, s) => sum + s.credit_price, 0);

  // Keyboard navigation for samples
  const handleKeyboardPlay = useCallback((index: number) => {
    const sample = samples[index];
    if (sample) {
      toggleGlobalPlay(sample.id);
    }
  }, [samples]);

  const { selectedIndex, isSelected: isKeyboardSelected } = useKeyboardNavigation(samples, {
    enabled: samples.length > 0 && !loading,
    onPlay: handleKeyboardPlay,
  });

  // Handle Escape to stop playback
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") {
        stopGlobalPlayback();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const fetchSamples = useCallback(
    async (offset = 0, append = false) => {
      try {
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (filters.genre !== "all") params.set("genre", filters.genre);
        if (filters.instrumentType !== "all") params.set("instrumentType", filters.instrumentType);
        if (filters.sampleType !== "all") params.set("sampleType", filters.sampleType);
        if (filters.key !== "all") {
          // Handle "Major"/"Minor" as scale filter, or full key like "C Major"
          if (filters.key === "Major" || filters.key === "Minor") {
            params.set("scale", filters.key);
          } else {
            params.set("key", filters.key);
          }
        }
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

  // Infinite scroll - load more when sentinel comes into view
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    let timeoutId: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && samples.length < total) {
          // Debounce to prevent rapid-fire requests
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            fetchSamples(samples.length, true);
          }, 100);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading, loadingMore, samples.length, total, fetchSamples]);

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

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/favorites");
      if (res.ok) {
        const data = await res.json();
        setFavoritedIds(new Set(data.sampleIds || []));
      }
    } catch {
      // silently fail
    }
  }, [user]);

  const fetchRatings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/ratings");
      if (res.ok) {
        const data = await res.json();
        setUserRatings(data.ratings || {});
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
    fetchFavorites();
    fetchRatings();
  }, [fetchPurchases, fetchFavorites, fetchRatings]);

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

  const handleFavoriteChange = (sampleId: string, favorited: boolean) => {
    if (favorited) {
      setFavoritedIds((prev) => new Set([...prev, sampleId]));
    } else {
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        next.delete(sampleId);
        return next;
      });
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
  const isFiltered = searchQuery || filters.genre !== "all" || filters.instrumentType !== "all" || filters.sampleType !== "all" || filters.key !== "all";

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

        {/* Quick Links for logged in users */}
        {user && !isFiltered && (
          <div className="flex gap-3 mb-6">
            <Link href="/favorites">
              <Button
                variant="outline"
                className="border-[#2a2a2a] text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] hover:border-red-500/50"
              >
                <Heart className="w-4 h-4 mr-2" />
                Favorites
              </Button>
            </Link>
            <Link href="/following">
              <Button
                variant="outline"
                className="border-[#2a2a2a] text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] hover:border-[#00FF88]/50"
              >
                <Users className="w-4 h-4 mr-2" />
                Following
              </Button>
            </Link>
          </div>
        )}

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
                    isFavorited={favoritedIds.has(sample.id)}
                    userRating={userRatings[sample.id]}
                    onPurchase={handlePurchase}
                    onFavoriteChange={handleFavoriteChange}
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

        {/* Keyboard Navigation Hint */}
        {samples.length > 0 && !loading && (
          <div className="mb-4 text-xs text-[#666] flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">↑↓</span> navigate
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Space</span> play/pause
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Esc</span> stop
          </div>
        )}

        {/* Results */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#a1a1a1]">
              {isFiltered ? `${total} result${total !== 1 ? "s" : ""}` : `${total} sample${total !== 1 ? "s" : ""}`}
            </h2>
            
            {/* Selection Controls */}
            {user && samples.length > 0 && !loading && (
              <div className="flex items-center gap-4">
                <button
                  onClick={selectAllUnowned}
                  className="flex items-center gap-2 text-sm text-[#a1a1a1] hover:text-white transition"
                >
                  {selectedIds.size === getSelectableSamples().length && getSelectableSamples().length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-[#00FF88]" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Select All
                </button>
                
                {selectedIds.size > 0 && (
                  <Button
                    onClick={handleBulkPurchase}
                    disabled={bulkPurchasing || selectedCost > (user.credits || 0)}
                    size="sm"
                    className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                  >
                    {bulkPurchasing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ShoppingCart className="w-4 h-4 mr-2" />
                    )}
                    Buy {selectedIds.size} ({selectedCost} cr)
                  </Button>
                )}
              </div>
            )}
          </div>

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
              {samples.map((sample, index) => (
                <div key={sample.id} className="flex items-center gap-2">
                  {/* Selection checkbox */}
                  {user && !purchasedIds.has(sample.id) && (
                    <button
                      onClick={() => toggleSelect(sample.id)}
                      className="flex-shrink-0 p-1"
                    >
                      {selectedIds.has(sample.id) ? (
                        <CheckSquare className="w-5 h-5 text-[#00FF88]" />
                      ) : (
                        <Square className="w-5 h-5 text-[#a1a1a1] hover:text-white" />
                      )}
                    </button>
                  )}
                  {/* Spacer for owned samples */}
                  {user && purchasedIds.has(sample.id) && (
                    <div className="w-7 flex-shrink-0" />
                  )}
                  
                  <div className={`flex-1 ${selectedIds.has(sample.id) ? "ring-1 ring-[#00FF88] rounded-lg" : ""}`}>
                    <SampleCard
                      sample={sample}
                      user={userForCard}
                      isOwned={purchasedIds.has(sample.id)}
                      isFavorited={favoritedIds.has(sample.id)}
                      userRating={userRatings[sample.id]}
                      isSelected={isKeyboardSelected(index)}
                      onPurchase={handlePurchase}
                      onFavoriteChange={handleFavoriteChange}
                    />
                  </div>
                </div>
              ))}

              {/* Infinite scroll sentinel */}
              {samples.length < total && (
                <div ref={loadMoreRef} className="flex justify-center pt-6">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-[#a1a1a1]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading more samples...
                    </div>
                  )}
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

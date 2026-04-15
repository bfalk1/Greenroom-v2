"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Loader2, Users, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Sliders } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sample, toggleGlobalPlay, stopGlobalPlayback, getGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { SampleRow } from "@/components/marketplace/SampleRow";
import { MarketplaceTabs, MarketplaceTab } from "@/components/marketplace/MarketplaceTabs";
import { PresetFilters, PresetFilterState } from "@/components/marketplace/PresetFilters";
import { PresetRow, Preset } from "@/components/marketplace/PresetRow";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { trackSearch, trackFilterChange, trackSortChange, trackSamplePurchase, trackPurchaseFailed } from "@/lib/analytics";
import { toast } from "sonner";

const PAGE_SIZE = 20;

interface FollowedArtist {
  id: string;
  artist_name: string;
  avatar_url: string | null;
  new_samples: number;
  total_samples: number;
}

type GreenroomDesktopApi = {
  isDesktop?: boolean;
  chooseLocalSampleFolder?: () => Promise<{ ok: boolean; sampleFolderPath?: string; error?: string }>;
  syncLocalSample?: (
    sampleId: string,
    sampleName: string,
    artistName?: string
  ) => Promise<{ ok: boolean; error?: string }>;
};

export default function MarketplacePage() {
  const { user, refreshUser } = useUser();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("samples");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>([]);
  const [followingSamples, setFollowingSamples] = useState<Sample[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const artistSliderRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});

  // Preset-specific state
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetTotal, setPresetTotal] = useState(0);
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetLoadingMore, setPresetLoadingMore] = useState(false);
  const [presetHasMore, setPresetHasMore] = useState(true);
  const [purchasedPresetIds, setPurchasedPresetIds] = useState<Set<string>>(new Set());
  const [favoritedPresetIds, setFavoritedPresetIds] = useState<Set<string>>(new Set());
  const [userPresetRatings, setUserPresetRatings] = useState<Record<string, number>>({});
  const [presetFilters, setPresetFilters] = useState<PresetFilterState>({
    synthName: "all",
    category: "all",
    genre: "all",
    sortBy: "random",
  });
  const presetLoadMoreRef = useRef<HTMLDivElement>(null);
  const hasFetchedPresetsRef = useRef(false);
  const [filters, setFilters] = useState({
    genre: "all",
    instrumentType: "all",
    sampleType: "all",
    key: "all",
    sortBy: "random",
  });
  const [sortColumn, setSortColumn] = useState<string>("popular");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const hasFetchedInitiallyRef = useRef(false);
  const playedSampleIdsRef = useRef<Set<string>>(new Set());

  const handleSort = (column: string) => {
    const newDirection = sortColumn === column
      ? (sortDirection === "asc" ? "desc" : "asc")
      : "desc";
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    trackSortChange(column, newDirection);
    // Update filters to trigger refetch
    const sortMap: Record<string, string> = {
      name: "name",
      genre: "genre",
      key: "key",
      bpm: "bpm",
      rating: "rating",
      price: "price",
      popular: "popular",
      recent: "recent",
    };
    setFilters(prev => ({ ...prev, sortBy: sortMap[column] || "random" }));
  };

  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center gap-1 text-xs font-medium text-[#a1a1a1] hover:text-white transition group"
    >
      {label}
      <span className={`transition ${sortColumn === column ? "text-[#39b54a]" : "text-[#3a3a3a] group-hover:text-[#666]"}`}>
        {sortColumn === column ? (
          sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </button>
  );

  // Track which samples have been played for play-before-buy analysis
  useEffect(() => {
    const interval = setInterval(() => {
      const playingId = getGlobalPlayingId();
      if (playingId) {
        playedSampleIdsRef.current.add(playingId);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
    onReachEnd: () => {
      if (!loadingMore && samples.length < total) {
        fetchSamples(samples.length, true);
      }
    },
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
        params.set("sortDir", sortDirection);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const res = await fetch(`/api/samples?${params.toString()}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error("Failed to fetch samples");

        const data = await res.json();

        if (!append && searchQuery) {
          trackSearch(searchQuery, data.total);
        }

        if (append) {
          setSamples((prev) => {
            const seenIds = new Set(prev.map((sample) => sample.id));
            const newSamples = data.samples.filter(
              (sample: Sample) => !seenIds.has(sample.id)
            );

            if (newSamples.length === 0 || data.samples.length < PAGE_SIZE) {
              setHasMore(false);
            }

            return newSamples.length > 0 ? [...prev, ...newSamples] : prev;
          });
        } else {
          setSamples(data.samples);
          setHasMore(data.samples.length >= PAGE_SIZE);
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
    [searchQuery, filters, sortDirection]
  );

  // Infinite scroll with debounce
  const lastFetchRef = useRef<number>(0);
  const [hasMore, setHasMore] = useState(true);
  
  useEffect(() => {
    // Reset hasMore when filters change
    setHasMore(true);
  }, [filters, searchQuery]);
  
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        // Debounce: minimum 800ms between fetches
        if (
          entries[0].isIntersecting && 
          !loading && 
          !loadingMore && 
          hasMore &&
          samples.length < total &&
          now - lastFetchRef.current > 800
        ) {
          lastFetchRef.current = now;
          fetchSamples(samples.length, true);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, samples.length, total, hasMore, fetchSamples]);

  const fetchFollowingData = useCallback(async () => {
    if (!user) {
      setFollowedArtists([]);
      setFollowingSamples([]);
      setFollowingCount(0);
      return;
    }
    
    try {
      setLoadingFollowing(true);
      // Fetch both artists and samples in parallel
      const [artistsRes, samplesRes] = await Promise.all([
        fetch("/api/samples/following/artists"),
        fetch("/api/samples/following?limit=6"),
      ]);
      
      if (artistsRes.ok) {
        const data = await artistsRes.json();
        setFollowedArtists(data.artists || []);
        setFollowingCount(data.following || 0);
      }
      
      if (samplesRes.ok) {
        const data = await samplesRes.json();
        setFollowingSamples(data.samples || []);
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
        setPurchasedPresetIds(new Set(data.presetIds || []));
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
        setFavoritedPresetIds(new Set(data.presetIds || []));
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
        setUserPresetRatings(data.presetRatings || {});
      }
    } catch {
      // silently fail
    }
  }, [user]);

  // Preset fetching
  const fetchPresets = useCallback(
    async (offset = 0, append = false) => {
      try {
        if (offset === 0) setPresetLoading(true);
        else setPresetLoadingMore(true);

        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (presetFilters.synthName !== "all") params.set("synthName", presetFilters.synthName);
        if (presetFilters.category !== "all") params.set("category", presetFilters.category);
        if (presetFilters.genre !== "all") params.set("genre", presetFilters.genre);
        params.set("sortBy", presetFilters.sortBy);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`/api/presets?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch presets");

        const data = await res.json();

        if (append) {
          setPresets((prev) => {
            const seenIds = new Set(prev.map((p) => p.id));
            const newPresets = data.presets.filter(
              (p: Preset) => !seenIds.has(p.id)
            );
            if (newPresets.length === 0 || data.presets.length < PAGE_SIZE) {
              setPresetHasMore(false);
            }
            return newPresets.length > 0 ? [...prev, ...newPresets] : prev;
          });
        } else {
          setPresets(data.presets);
          setPresetHasMore(data.presets.length >= PAGE_SIZE);
        }
        setPresetTotal(data.total);
      } catch (error) {
        console.error("Error fetching presets:", error);
        toast.error("Failed to load presets");
      } finally {
        setPresetLoading(false);
        setPresetLoadingMore(false);
      }
    },
    [searchQuery, presetFilters]
  );

  useEffect(() => {
    fetchSamples(0, false);
    hasFetchedInitiallyRef.current = true;
  }, [fetchSamples]);

  useEffect(() => {
    fetchFollowingData();
  }, [fetchFollowingData]);

  useEffect(() => {
    fetchPurchases();
    fetchFavorites();
    fetchRatings();
  }, [fetchPurchases, fetchFavorites, fetchRatings]);

  // Fetch presets when tab switches or filters change
  useEffect(() => {
    if (activeTab === "presets") {
      if (!hasFetchedPresetsRef.current) {
        fetchPresets(0, false);
        hasFetchedPresetsRef.current = true;
      }
    }
  }, [activeTab, fetchPresets]);

  // Refetch presets on filter/search change
  useEffect(() => {
    if (activeTab !== "presets" || !hasFetchedPresetsRef.current) return;
    const timer = setTimeout(() => {
      fetchPresets(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, presetFilters]);

  // Preset infinite scroll
  useEffect(() => {
    if (activeTab !== "presets") return;
    const sentinel = presetLoadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !presetLoading &&
          !presetLoadingMore &&
          presetHasMore &&
          presets.length < presetTotal
        ) {
          fetchPresets(presets.length, true);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, presetLoading, presetLoadingMore, presets.length, presetTotal, presetHasMore, fetchPresets]);

  // Reset preset hasMore when filters change
  useEffect(() => {
    setPresetHasMore(true);
  }, [presetFilters, searchQuery]);

  const handleTabChange = (tab: MarketplaceTab) => {
    setActiveTab(tab);
    stopGlobalPlayback();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Debounce search and sort changes
  useEffect(() => {
    if (!hasFetchedInitiallyRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      fetchSamples(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, sortDirection]);

  const handleFilterChange = (newFilters: typeof filters) => {
    trackFilterChange({
      genre: newFilters.genre !== "all" ? newFilters.genre : undefined,
      instrumentType: newFilters.instrumentType !== "all" ? newFilters.instrumentType : undefined,
      sampleType: newFilters.sampleType !== "all" ? newFilters.sampleType : undefined,
      key: newFilters.key !== "all" ? newFilters.key : undefined,
    });
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
        trackPurchaseFailed(sample.id, data.error?.includes("insufficient") ? "insufficient_credits" : "error");
        throw new Error(data.error || "Purchase failed");
      }

      trackSamplePurchase({
        sampleId: sample.id,
        name: sample.name,
        artist: sample.artist_name || "Unknown",
        creditPrice: sample.credit_price,
        playedBeforeBuy: playedSampleIdsRef.current.has(sample.id),
      });

      // Update purchased set
      setPurchasedIds((prev) => new Set([...prev, sample.id]));
      // Refresh user credits
      refreshUser();

      const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
      if (greenroom?.isDesktop && greenroom.chooseLocalSampleFolder && greenroom.syncLocalSample) {
        try {
          const folderResult = await greenroom.chooseLocalSampleFolder();
          if (folderResult?.ok) {
            await greenroom.syncLocalSample(sample.id, sample.name, sample.artist_name);
          }
        } catch (syncError) {
          console.error("Desktop sync after purchase failed:", syncError);
        }
      }

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

  const handlePresetPurchase = async (preset: Preset) => {
    if (!user) {
      toast.error("Please log in to purchase presets");
      return;
    }

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: preset.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Purchase failed");
      }

      setPurchasedPresetIds((prev) => new Set([...prev, preset.id]));
      refreshUser();
      toast.success(`Purchased "${preset.name}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase failed";
      toast.error(message);
    }
  };

  const handlePresetFavoriteChange = (presetId: string, favorited: boolean) => {
    if (favorited) {
      setFavoritedPresetIds((prev) => new Set([...prev, presetId]));
    } else {
      setFavoritedPresetIds((prev) => {
        const next = new Set(prev);
        next.delete(presetId);
        return next;
      });
    }
  };

  const handlePresetFilterChange = (newFilters: PresetFilterState) => {
    setPresetFilters(newFilters);
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
        {/* For You Section - Horizontal artist slider */}
        {!isFiltered && user && followedArtists.length > 0 && (
          <div className="mb-10 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#39b54a]/10 rounded-lg">
                  <Users className="w-5 h-5 text-[#39b54a]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">For You</h2>
                  <p className="text-xs text-[#a1a1a1]">
                    Updates from {followingCount} artist{followingCount !== 1 ? "s" : ""} you follow
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] p-2"
                  onClick={() => artistSliderRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] p-2"
                  onClick={() => artistSliderRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Link href="/following">
                  <Button
                    variant="ghost"
                    className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
                  >
                    See all samples
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>

            {loadingFollowing ? (
              <div className="flex gap-4 overflow-hidden">
                {Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-32 h-40 bg-[#1a1a1a] rounded-lg animate-pulse"
                    />
                  ))}
              </div>
            ) : (
              <div 
                ref={artistSliderRef}
                className="flex gap-3 overflow-x-auto overflow-y-visible pb-4 pt-2 scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {followedArtists.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artist/${encodeURIComponent(artist.artist_name)}`}
                    className="flex-shrink-0 group"
                  >
                    <div className="w-28 hover:scale-105 transition-all">
                      <div className="relative w-20 h-20 mx-auto mb-2 rounded-full overflow-hidden bg-[#2a2a2a] ring-2 ring-[#2a2a2a] group-hover:ring-[#39b54a]/50 transition-all">
                        {artist.avatar_url ? (
                          <img
                            src={artist.avatar_url}
                            alt={artist.artist_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#666]">
                            <Users className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <p className="text-white text-xs font-medium text-center truncate group-hover:text-[#39b54a] transition-colors mt-1">
                        {artist.artist_name}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prompt to follow artists if user is logged in but not following anyone */}
        {!isFiltered && user && followingCount === 0 && !loadingFollowing && (
          <div className="mb-10 p-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#39b54a]/10 rounded-full">
                <Users className="w-6 h-6 text-[#39b54a]" />
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

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a1a1a1]" />
            <Input
              type="text"
              placeholder={activeTab === "samples" ? "Search samples, creators, genres..." : "Search presets, synths, creators..."}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
            />
          </div>
        </div>

        {/* Tabs */}
        <MarketplaceTabs activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Filters */}
        {activeTab === "samples" ? (
          <SampleFilters onFilterChange={handleFilterChange} />
        ) : (
          <PresetFilters onFilterChange={handlePresetFilterChange} />
        )}

        {/* Keyboard Navigation Hint */}
        {activeTab === "samples" && samples.length > 0 && !loading && (
          <div className="mb-4 text-xs text-[#666] flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">↑↓</span> navigate
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Space</span> play/pause
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Esc</span> stop
          </div>
        )}

        {/* Samples Tab Content */}
        {activeTab === "samples" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#a1a1a1]">
                {isFiltered ? `${total} result${total !== 1 ? "s" : ""}` : `${total} sample${total !== 1 ? "s" : ""}`}
              </h2>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array(8)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse"
                    />
                  ))}
              </div>
            ) : samples.length > 0 ? (
              <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
                  <div className="w-10" /> {/* Play button column */}
                  <SortHeader column="name" label="Name" />
                  <div className="hidden md:block"><SortHeader column="genre" label="Genre" /></div>
                  <div className="hidden md:block"><SortHeader column="key" label="Key" /></div>
                  <div className="hidden md:block"><SortHeader column="bpm" label="BPM" /></div>
                  <div className="hidden md:block"><SortHeader column="rating" label="★" /></div>
                  <div className="text-xs font-medium text-[#a1a1a1]"></div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-[#2a2a2a]">
                  {samples.map((sample, index) => (
                    <SampleRow
                      key={sample.id}
                      sample={sample}
                      user={userForCard}
                      isOwned={purchasedIds.has(sample.id)}
                      isFavorited={favoritedIds.has(sample.id)}
                      userRating={userRatings[sample.id]}
                      isSelected={isKeyboardSelected(index)}
                      onPurchase={handlePurchase}
                      onFavoriteChange={handleFavoriteChange}
                      refreshUser={refreshUser}
                    />
                  ))}
                </div>

                {/* Infinite scroll sentinel / Load more */}
                {hasMore && samples.length < total && (
                  <div ref={loadMoreRef} className="flex flex-col items-center gap-3 py-6 border-t border-[#2a2a2a]">
                    {loadingMore ? (
                      <div className="flex items-center gap-2 text-[#a1a1a1]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more...
                      </div>
                    ) : (
                      <>
                        <span className="text-[#3a3a3a] text-sm">{samples.length} of {total}</span>
                        <button
                          onClick={() => fetchSamples(samples.length, true)}
                          className="text-sm text-[#39b54a] hover:text-white transition"
                        >
                          Load more
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!hasMore && samples.length > 0 && (
                  <div className="text-center py-6 border-t border-[#2a2a2a]">
                    <span className="text-[#3a3a3a] text-sm">All {samples.length} samples loaded</span>
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
        )}

        {/* Presets Tab Content */}
        {activeTab === "presets" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#a1a1a1]">
                {presetTotal} preset{presetTotal !== 1 ? "s" : ""}
              </h2>
            </div>

            {presetLoading ? (
              <div className="space-y-2">
                {Array(8)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse"
                    />
                  ))}
              </div>
            ) : presets.length > 0 ? (
              <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_80px_1fr_80px_90px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
                  <div className="w-10" />
                  <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Synth</span>
                  <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
                  <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Category</span>
                  <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
                  <span className="hidden md:block text-xs font-medium text-[#a1a1a1] text-center">&#9733;</span>
                  <div className="text-xs font-medium text-[#a1a1a1]"></div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-[#2a2a2a]">
                  {presets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      user={userForCard}
                      isOwned={purchasedPresetIds.has(preset.id)}
                      isFavorited={favoritedPresetIds.has(preset.id)}
                      userRating={userPresetRatings[preset.id]}
                      onPurchase={handlePresetPurchase}
                      onFavoriteChange={handlePresetFavoriteChange}
                    />
                  ))}
                </div>

                {/* Infinite scroll sentinel */}
                {presetHasMore && presets.length < presetTotal && (
                  <div ref={presetLoadMoreRef} className="flex flex-col items-center gap-3 py-6 border-t border-[#2a2a2a]">
                    {presetLoadingMore ? (
                      <div className="flex items-center gap-2 text-[#a1a1a1]">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more...
                      </div>
                    ) : (
                      <>
                        <span className="text-[#3a3a3a] text-sm">{presets.length} of {presetTotal}</span>
                        <button
                          onClick={() => fetchPresets(presets.length, true)}
                          className="text-sm text-[#39b54a] hover:text-white transition"
                        >
                          Load more
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!presetHasMore && presets.length > 0 && (
                  <div className="text-center py-6 border-t border-[#2a2a2a]">
                    <span className="text-[#3a3a3a] text-sm">All {presets.length} presets loaded</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16">
                <Sliders className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  No presets found matching your filters.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Users, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Sliders, Shuffle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Sample, toggleGlobalPlay, stopGlobalPlayback, getGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { SampleRow } from "@/components/marketplace/SampleRow";
import { MarketplaceTabs, MarketplaceTab } from "@/components/marketplace/MarketplaceTabs";
import { PresetFilters, PresetFilterState } from "@/components/marketplace/PresetFilters";
import { SearchSuggestions } from "@/components/marketplace/SearchSuggestions";
import { PresetRow, Preset } from "@/components/marketplace/PresetRow";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { trackSearch, trackFilterChange, trackSortChange, trackSamplePurchase, trackPurchaseFailed } from "@/lib/analytics";
import { setNowPlayingQueue, setQueueNavigation } from "@/lib/audio/nowPlaying";
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
  ensureLocalSampleFolder?: () => Promise<{ ok: boolean; sampleFolderPath?: string; cancelled?: boolean; unreachable?: boolean; error?: string }>;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [randomSeed, setRandomSeed] = useState(() => Math.random());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});

  // Preset-specific state
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetTotal, setPresetTotal] = useState(0);
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetCurrentPage, setPresetCurrentPage] = useState(1);
  const [purchasedPresetIds, setPurchasedPresetIds] = useState<Set<string>>(new Set());
  const [favoritedPresetIds, setFavoritedPresetIds] = useState<Set<string>>(new Set());
  const [userPresetRatings, setUserPresetRatings] = useState<Record<string, number>>({});
  const [presetFilters, setPresetFilters] = useState<PresetFilterState>({
    synthName: "all",
    category: "all",
    genre: "all",
    sortBy: "random",
  });
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
  const hasFetchedInitiallyRef = useRef(false);
  const playedSampleIdsRef = useRef<Set<string>>(new Set());
  const samplesAbortRef = useRef<AbortController | null>(null);
  const presetsAbortRef = useRef<AbortController | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const presetTotalPages = Math.max(1, Math.ceil(presetTotal / PAGE_SIZE));

  // Pending-play markers consumed when the new page's items mount.
  const pendingSamplesPlayRef = useRef<"first" | "last" | null>(null);
  const pendingPresetsPlayRef = useRef<"first" | "last" | null>(null);

  const goToNextSamplesPage = useCallback(() => {
    if (currentPage >= totalPages) return;
    pendingSamplesPlayRef.current = "first";
    setCurrentPage(currentPage + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage, totalPages]);

  const goToPrevSamplesPage = useCallback(() => {
    if (currentPage <= 1) return;
    pendingSamplesPlayRef.current = "last";
    setCurrentPage(currentPage - 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const goToNextPresetsPage = useCallback(() => {
    if (presetCurrentPage >= presetTotalPages) return;
    pendingPresetsPlayRef.current = "first";
    setPresetCurrentPage(presetCurrentPage + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [presetCurrentPage, presetTotalPages]);

  const goToPrevPresetsPage = useCallback(() => {
    if (presetCurrentPage <= 1) return;
    pendingPresetsPlayRef.current = "last";
    setPresetCurrentPage(presetCurrentPage - 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [presetCurrentPage]);

  const { selectedIndex, isSelected: isKeyboardSelected, setSelectedIndex } = useKeyboardNavigation(samples, {
    enabled: samples.length > 0 && !loading,
    onPlay: handleKeyboardPlay,
    onReachEnd: () => goToNextSamplesPage(),
    onReachStart: () => goToPrevSamplesPage(),
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
    async (page: number) => {
      // Cancel any in-flight samples request so rapid filter/search
      // changes don't pile up requests that race to set state.
      samplesAbortRef.current?.abort();
      const controller = new AbortController();
      samplesAbortRef.current = controller;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);

      try {
        setLoading(true);

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
        if (filters.sortBy === "random") {
          params.set("seed", String(randomSeed));
        }
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String((page - 1) * PAGE_SIZE));

        const res = await fetch(`/api/samples?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Failed to fetch samples");

        const data = await res.json();

        if (page === 1 && searchQuery) {
          trackSearch(searchQuery, data.total);
        }

        setSamples(data.samples);
        setTotal(data.total);
      } catch (error) {
        // Silent abort when a newer request supersedes this one; toast only
        // on real failures (network, 500s, or the 15s timeout).
        if ((error as Error)?.name === "AbortError" && !timedOut) return;
        console.error("Error fetching samples:", error);
        toast.error("Failed to load samples");
      } finally {
        clearTimeout(timeoutId);
        if (samplesAbortRef.current === controller) {
          samplesAbortRef.current = null;
        }
        setLoading(false);
      }
    },
    [searchQuery, filters, sortDirection, randomSeed]
  );

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
    async (page: number) => {
      presetsAbortRef.current?.abort();
      const controller = new AbortController();
      presetsAbortRef.current = controller;

      try {
        setPresetLoading(true);

        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (presetFilters.synthName !== "all") params.set("synthName", presetFilters.synthName);
        if (presetFilters.category !== "all") params.set("category", presetFilters.category);
        if (presetFilters.genre !== "all") params.set("genre", presetFilters.genre);
        params.set("sortBy", presetFilters.sortBy);
        if (presetFilters.sortBy === "random") {
          params.set("seed", String(randomSeed));
        }
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String((page - 1) * PAGE_SIZE));

        const res = await fetch(`/api/presets?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch presets");

        const data = await res.json();

        setPresets(data.presets);
        setPresetTotal(data.total);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.error("Error fetching presets:", error);
        toast.error("Failed to load presets");
      } finally {
        if (presetsAbortRef.current === controller) {
          presetsAbortRef.current = null;
        }
        setPresetLoading(false);
      }
    },
    [searchQuery, presetFilters, randomSeed]
  );

  useEffect(() => {
    fetchFollowingData();
  }, [fetchFollowingData]);

  useEffect(() => {
    fetchPurchases();
    fetchFavorites();
    fetchRatings();
  }, [fetchPurchases, fetchFavorites, fetchRatings]);

  // Reset preset page when filters/search change
  useEffect(() => {
    setPresetCurrentPage(1);
  }, [presetFilters, searchQuery, randomSeed]);

  // Fetch presets when tab is active or page/filters change
  useEffect(() => {
    if (activeTab !== "presets") return;
    const delay = hasFetchedPresetsRef.current ? 300 : 0;
    const timer = setTimeout(() => {
      hasFetchedPresetsRef.current = true;
      fetchPresets(presetCurrentPage);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, presetCurrentPage, searchQuery, presetFilters, randomSeed]);

  const handleTabChange = (tab: MarketplaceTab) => {
    setActiveTab(tab);
    stopGlobalPlayback();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Reset to first page when filters/search change so the user
  // doesn't land on an empty page beyond the new result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, sortDirection, randomSeed]);

  // Register the active tab's items as the player's queue so the
  // NowPlayingBar's prev/next can step through them.
  useEffect(() => {
    if (activeTab === "samples") {
      setNowPlayingQueue(
        samples.map((s) => ({
          id: s.id,
          name: s.name,
          artistName: s.artist_name,
          coverUrl: s.cover_art_url || s.creator_avatar,
          artistSlug: s.artist_name || s.creator_id,
        }))
      );
    } else {
      setNowPlayingQueue(
        presets.map((p) => ({
          id: p.id,
          name: p.name,
          artistName: p.artist_name,
          coverUrl: p.cover_image_url || p.creator_avatar || undefined,
          artistSlug: p.artist_name || p.creator_id,
        }))
      );
    }
  }, [activeTab, samples, presets]);

  useEffect(() => () => setNowPlayingQueue([]), []);

  // After a samples-page change (from arrows or bar), play the requested edge.
  useEffect(() => {
    if (
      activeTab !== "samples" ||
      loading ||
      samples.length === 0 ||
      !pendingSamplesPlayRef.current
    ) {
      return;
    }
    const direction = pendingSamplesPlayRef.current;
    pendingSamplesPlayRef.current = null;
    const target = direction === "first" ? samples[0] : samples[samples.length - 1];
    if (!target) return;
    const targetIndex = direction === "first" ? 0 : samples.length - 1;
    setSelectedIndex(targetIndex);
    // Defer so newly-mounted rows have registered with globalToggleFns.
    setTimeout(() => toggleGlobalPlay(target.id), 0);
  }, [activeTab, samples, loading, setSelectedIndex]);

  // Same for presets when their page changes.
  useEffect(() => {
    if (
      activeTab !== "presets" ||
      presetLoading ||
      presets.length === 0 ||
      !pendingPresetsPlayRef.current
    ) {
      return;
    }
    const direction = pendingPresetsPlayRef.current;
    pendingPresetsPlayRef.current = null;
    const target = direction === "first" ? presets[0] : presets[presets.length - 1];
    if (!target) return;
    setTimeout(() => toggleGlobalPlay(target.id), 0);
  }, [activeTab, presets, presetLoading]);

  // Register cross-page navigation for the active tab so the bar can
  // auto-advance/retreat when at the queue edges.
  useEffect(() => {
    if (activeTab === "samples") {
      setQueueNavigation({
        hasPrevPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
        onPrevPage: goToPrevSamplesPage,
        onNextPage: goToNextSamplesPage,
      });
    } else {
      setQueueNavigation({
        hasPrevPage: presetCurrentPage > 1,
        hasNextPage: presetCurrentPage < presetTotalPages,
        onPrevPage: goToPrevPresetsPage,
        onNextPage: goToNextPresetsPage,
      });
    }
  }, [
    activeTab,
    currentPage,
    totalPages,
    presetCurrentPage,
    presetTotalPages,
    goToPrevSamplesPage,
    goToNextSamplesPage,
    goToPrevPresetsPage,
    goToNextPresetsPage,
  ]);

  useEffect(() => () => setQueueNavigation({}), []);

  // Fetch samples on mount and debounce search/filter changes afterward.
  // Keeping this as the single fetch driver avoids the double-fire that
  // happened when a second useEffect also ran on fetchSamples identity.
  useEffect(() => {
    const delay = hasFetchedInitiallyRef.current ? 300 : 0;
    const timer = setTimeout(() => {
      hasFetchedInitiallyRef.current = true;
      fetchSamples(currentPage);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters, sortDirection, randomSeed, currentPage]);

  const handleFilterChange = (newFilters: typeof filters) => {
    trackFilterChange({
      genre: newFilters.genre !== "all" ? newFilters.genre : undefined,
      instrumentType: newFilters.instrumentType !== "all" ? newFilters.instrumentType : undefined,
      sampleType: newFilters.sampleType !== "all" ? newFilters.sampleType : undefined,
      key: newFilters.key !== "all" ? newFilters.key : undefined,
    });
    setFilters(newFilters);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePresetPageChange = (page: number) => {
    setPresetCurrentPage(page);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
      if (greenroom?.isDesktop && greenroom.ensureLocalSampleFolder && greenroom.syncLocalSample) {
        try {
          const folderResult = await greenroom.ensureLocalSampleFolder();
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

  const handleReroll = () => {
    setRandomSeed(Math.random());
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
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a1a1a1] z-10" />
            <Input
              type="text"
              placeholder={activeTab === "samples" ? "Search samples, creators, genres..." : "Search presets, synths, creators..."}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
            />
            <SearchSuggestions
              query={searchQuery}
              visible={searchFocused}
              onSelect={(value) => {
                setSearchQuery(value);
                setSearchFocused(false);
              }}
              onClose={() => setSearchFocused(false)}
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
              {filters.sortBy === "random" && (
                <button
                  onClick={handleReroll}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#a1a1a1] hover:text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#39b54a]/50 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Reroll random order"
                >
                  <Shuffle className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Reroll
                </button>
              )}
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

              </div>
            ) : (
              <div className="text-center py-16">
                <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  No samples found matching your filters.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  disabled={loading}
                />
                <span className="text-xs text-[#666]">
                  Page {currentPage} of {totalPages} · {total} sample{total !== 1 ? "s" : ""}
                </span>
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
              {presetFilters.sortBy === "random" && (
                <button
                  onClick={handleReroll}
                  disabled={presetLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#a1a1a1] hover:text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#39b54a]/50 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Reroll random order"
                >
                  <Shuffle className={`w-3.5 h-3.5 ${presetLoading ? "animate-spin" : ""}`} />
                  Reroll
                </button>
              )}
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

              </div>
            ) : (
              <div className="text-center py-16">
                <Sliders className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  No presets found matching your filters.
                </p>
              </div>
            )}

            {presetTotalPages > 1 && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <Pagination
                  currentPage={presetCurrentPage}
                  totalPages={presetTotalPages}
                  onPageChange={handlePresetPageChange}
                  disabled={presetLoading}
                />
                <span className="text-xs text-[#666]">
                  Page {presetCurrentPage} of {presetTotalPages} · {presetTotal} preset{presetTotal !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Loader2, Users, ChevronRight, ChevronLeft, Heart, Play, Pause, Download, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sample, toggleGlobalPlay, stopGlobalPlayback, getGlobalPlayingId, getGlobalAudio, globalSetters, globalToggleFns, setGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { SampleCard } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { SampleRating } from "@/components/marketplace/SampleRating";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { toast } from "sonner";

const PAGE_SIZE = 20;

// Inline SampleRow component for the table grid
interface SampleRowProps {
  sample: Sample;
  user: { id: string; email?: string; credits?: number; subscription_status?: string; is_creator?: boolean; role?: string } | null;
  isOwned: boolean;
  isFavorited: boolean;
  userRating?: number;
  isPlaying: boolean;
  isSelected: boolean;
  onPurchase: (sample: Sample) => void;
  onFavoriteChange: (sampleId: string, favorited: boolean) => void;
  refreshUser: () => void;
}

function SampleRow({
  sample,
  user,
  isOwned,
  isFavorited: isFavoritedProp,
  userRating,
  isPlaying,
  isSelected,
  onPurchase,
  onFavoriteChange,
  refreshUser,
}: SampleRowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(isFavoritedProp);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsFavorited(isFavoritedProp);
  }, [isFavoritedProp]);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  // Create toggle function for this sample
  const togglePlayFn = useCallback(async () => {
    const audio = getGlobalAudio();
    if (!audio) return;

    const currentPlayingId = getGlobalPlayingId();

    // If this sample is currently playing, pause it
    if (currentPlayingId === sample.id) {
      audio.pause();
      setIsPlayingState(false);
      setGlobalPlayingId(null);
      return;
    }

    // Stop any other playing sample
    if (currentPlayingId && currentPlayingId !== sample.id) {
      const prevSetter = globalSetters.get(currentPlayingId);
      prevSetter?.(false);
      audio.pause();
    }

    setIsLoading(true);
    try {
      let url: string;
      if (sample.preview_url) {
        url = sample.preview_url;
      } else {
        const res = await fetch(`/api/samples/${sample.id}/preview`);
        const data = await res.json();
        if (!res.ok || !data.url) {
          console.error("Preview failed:", data.error);
          setIsLoading(false);
          return;
        }
        url = data.url;
      }

      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
      setGlobalPlayingId(sample.id);
      setIsPlayingState(true);
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sample.id, sample.preview_url]);

  // Register this row's setter and toggle function for global audio control
  useEffect(() => {
    globalSetters.set(sample.id, setIsPlayingState);
    globalToggleFns.set(sample.id, togglePlayFn);
    return () => {
      globalSetters.delete(sample.id);
      globalToggleFns.delete(sample.id);
      if (getGlobalPlayingId() === sample.id) {
        getGlobalAudio()?.pause();
        setGlobalPlayingId(null);
      }
    };
  }, [sample.id, togglePlayFn]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await togglePlayFn();
  };

  const handlePurchase = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user || isOwned || isPurchasing) return;
    setIsPurchasing(true);
    try {
      await onPurchase(sample);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user || !isOwned || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/downloads/${sample.id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sample.name}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded "${sample.name}" 🎵`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed";
      toast.error(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Please log in to save favorites");
      return;
    }
    if (isFavoriting) return;
    setIsFavoriting(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
      const data = await res.json();
      setIsFavorited(data.favorited);
      onFavoriteChange(sample.id, data.favorited);
      if (data.favorited) toast.success("Added to favorites ❤️");
    } catch {
      toast.error("Failed to update favorite");
    } finally {
      setIsFavoriting(false);
    }
  };

  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[auto_1fr_80px_100px] md:grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px] gap-2 md:gap-4 px-3 md:px-4 py-3 items-center transition-colors ${
        isSelected
          ? "bg-[#00FF88]/10"
          : isPlayingState
          ? "bg-[#00FF88]/5"
          : "hover:bg-[#242424]"
      }`}
    >
      {/* Cover Art + Play Button */}
      <div className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group">
        <img
          src={
            sample.cover_art_url ||
            sample.creator_avatar ||
            "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=80&h=80&fit=crop"
          }
          alt={sample.name}
          className="w-full h-full object-cover"
        />
        <button
          onClick={handlePlay}
          className={`absolute inset-0 flex items-center justify-center transition ${
            isPlayingState || isLoading
              ? "bg-black/60"
              : "bg-black/0 group-hover:bg-black/60"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#00FF88]" />
          ) : isPlayingState ? (
            <Pause className="w-4 h-4 fill-current text-[#00FF88]" />
          ) : (
            <Play className="w-4 h-4 fill-current text-white opacity-0 group-hover:opacity-100 transition ml-0.5" />
          )}
        </button>
      </div>

      {/* Name + Artist */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{sample.name}</p>
        <Link
          href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
          className="text-xs text-[#666] hover:text-[#00FF88] truncate transition block"
        >
          {sample.artist_name || "Unknown"}
        </Link>
      </div>

      {/* Artist - hidden on mobile */}
      <Link
        href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
        className="hidden md:block text-sm text-[#a1a1a1] hover:text-[#00FF88] truncate transition"
      >
        {sample.artist_name || "Unknown"}
      </Link>

      {/* Key - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.key || "—"}</span>

      {/* BPM - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.bpm || "—"}</span>

      {/* Rating - hidden on mobile */}
      <div className="hidden md:block">
        <SampleRating
          sample={sample}
          user={user}
          isOwned={isOwned}
          initialRating={userRating}
        />
      </div>

      {/* Price */}
      <div>
        {isOwned ? (
          <span className="text-xs text-[#00FF88] font-medium">Owned</span>
        ) : (
          <span className="text-sm text-[#00FF88] font-bold">{sample.credit_price} cr</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleFavorite}
          disabled={isFavoriting}
          className={`p-1.5 rounded transition ${
            isFavorited ? "text-red-500" : "text-[#3a3a3a] hover:text-red-500"
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
        </button>

        <Button
          onClick={isOwned ? handleDownload : handlePurchase}
          disabled={isPurchasing || isDownloading || !user || (!isOwned && (user?.credits ?? 0) < sample.credit_price)}
          size="sm"
          className={`h-7 w-7 p-0 ${
            isOwned
              ? "bg-[#00FF88] text-black hover:bg-[#00cc6a]"
              : (user?.credits ?? 0) < sample.credit_price
              ? "bg-[#2a2a2a] text-[#666] cursor-not-allowed"
              : "bg-[#2a2a2a] text-white hover:bg-[#00FF88] hover:text-black"
          }`}
          title={isOwned ? "Download" : (user?.credits ?? 0) < sample.credit_price ? "Not enough credits" : "Get"}
        >
          {isPurchasing || isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface FollowedArtist {
  id: string;
  artist_name: string;
  avatar_url: string | null;
  new_samples: number;
  total_samples: number;
}

export default function MarketplacePage() {
  const { user, refreshUser } = useUser();
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
  const [filters, setFilters] = useState({
    genre: "all",
    instrumentType: "all",
    sampleType: "all",
    key: "all",
    sortBy: "random",
  });
  const [sortColumn, setSortColumn] = useState<string>("popular");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Track playing state
  useEffect(() => {
    const interval = setInterval(() => {
      setPlayingId(getGlobalPlayingId());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    // Update filters to trigger refetch
    const sortMap: Record<string, string> = {
      name: "name",
      artist: "artist",
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
      <span className={`transition ${sortColumn === column ? "text-[#00FF88]" : "text-[#3a3a3a] group-hover:text-[#666]"}`}>
        {sortColumn === column ? (
          sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </button>
  );

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
    [searchQuery, filters, sortDirection]
  );

  // Infinite scroll
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && samples.length < total) {
          fetchSamples(samples.length, true);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, samples.length, total, fetchSamples]);

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
    fetchFollowingData();
  }, [fetchFollowingData]);

  useEffect(() => {
    fetchPurchases();
    fetchFavorites();
    fetchRatings();
  }, [fetchPurchases, fetchFavorites, fetchRatings]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Debounce search and sort changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSamples(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, sortDirection]);

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

        {/* For You Section - Horizontal artist slider */}
        {!isFiltered && user && followedArtists.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#00FF88]/10 rounded-lg">
                  <Users className="w-5 h-5 text-[#00FF88]" />
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
                className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {followedArtists.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artist/${encodeURIComponent(artist.artist_name)}`}
                    className="flex-shrink-0 group"
                  >
                    <div className="w-32 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 hover:border-[#00FF88]/50 transition-all hover:scale-105">
                      <div className="relative w-24 h-24 mx-auto mb-3 rounded-full overflow-hidden bg-[#2a2a2a]">
                        {artist.avatar_url ? (
                          <img
                            src={artist.avatar_url}
                            alt={artist.artist_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#666]">
                            <Users className="w-8 h-8" />
                          </div>
                        )}
                        {artist.new_samples > 0 && (
                          <div className="absolute -top-1 -right-1 bg-[#00FF88] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                            {artist.new_samples} new
                          </div>
                        )}
                      </div>
                      <p className="text-white text-sm font-medium text-center truncate group-hover:text-[#00FF88] transition-colors">
                        {artist.artist_name}
                      </p>
                      <p className="text-[#666] text-xs text-center">
                        {artist.total_samples} sample{artist.total_samples !== 1 ? "s" : ""}
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

        {/* Results Grid */}
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
              <div className="grid grid-cols-[auto_1fr_80px_100px] md:grid-cols-[auto_1fr_120px_80px_80px_100px_80px_100px] gap-2 md:gap-4 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
                <div className="w-10" /> {/* Play button column */}
                <SortHeader column="name" label="Name" />
                <div className="hidden md:block"><SortHeader column="artist" label="Artist" /></div>
                <div className="hidden md:block"><SortHeader column="key" label="Key" /></div>
                <div className="hidden md:block"><SortHeader column="bpm" label="BPM" /></div>
                <div className="hidden md:block"><SortHeader column="rating" label="Rating" /></div>
                <SortHeader column="price" label="Price" />
                <div className="text-xs font-medium text-[#a1a1a1]">Actions</div>
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
                    isPlaying={playingId === sample.id}
                    isSelected={isKeyboardSelected(index)}
                    onPurchase={handlePurchase}
                    onFavoriteChange={handleFavoriteChange}
                    refreshUser={refreshUser}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              {samples.length < total && (
                <div ref={loadMoreRef} className="flex justify-center py-6 border-t border-[#2a2a2a]">
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-[#a1a1a1]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading more...
                    </div>
                  ) : (
                    <span className="text-[#3a3a3a] text-sm">{samples.length} of {total}</span>
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

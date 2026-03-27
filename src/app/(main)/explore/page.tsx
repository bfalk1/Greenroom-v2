"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Music, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sample, toggleGlobalPlay, stopGlobalPlayback } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { ExploreRow } from "@/components/marketplace/ExploreRow";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const GENRES = [
  "Hip Hop", "Trap", "R&B", "Pop", "House", "Tech House", 
  "EDM", "Disco", "Soul", "Techno", "Cinematic", "Reggaeton"
];

const INSTRUMENTS = [
  "Drums", "Vocals", "Synth", "Keys", "Guitar", "Percussion",
  "Piano", "Strings", "Bass", "Brass", "FX", "Pads"
];

export default function ExplorePage() {
  const { user } = useUser();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState({
    genre: "all",
    instrumentType: "all",
    sampleType: "all",
    key: "all",
    sortBy: "popular",
  });
  const [sortColumn, setSortColumn] = useState<string>("popular");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [hasMore, setHasMore] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<number>(0);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    const sortMap: Record<string, string> = {
      name: "name",
      genre: "genre",
      key: "key",
      bpm: "bpm",
      rating: "rating",
      popular: "popular",
      recent: "recent",
    };
    setFilters(prev => ({ ...prev, sortBy: sortMap[column] || "popular" }));
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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
        if (activeSearch) params.set("search", activeSearch);
        if (filters.genre !== "all") params.set("genre", filters.genre);
        if (filters.instrumentType !== "all") params.set("instrumentType", filters.instrumentType);
        if (filters.sampleType !== "all") params.set("sampleType", filters.sampleType);
        if (filters.key !== "all") {
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
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const res = await fetch(`/api/samples?${params.toString()}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error("Failed to fetch samples");

        const data = await res.json();

        if (append) {
          const newSamples = data.samples.filter((s: Sample) => 
            !samples.some(existing => existing.id === s.id)
          );
          
          if (newSamples.length === 0 || data.samples.length < PAGE_SIZE) {
            setHasMore(false);
          }
          
          if (newSamples.length > 0) {
            setSamples((prev) => [...prev, ...newSamples]);
          }
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
    [activeSearch, filters, sortDirection, samples]
  );

  useEffect(() => {
    setHasMore(true);
  }, [filters, activeSearch]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !showResults) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
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
  }, [loading, loadingMore, samples.length, total, hasMore, fetchSamples, showResults]);

  // Fetch when showResults becomes true or filters change
  useEffect(() => {
    if (showResults) {
      fetchSamples(0, false);
    }
  }, [showResults, activeSearch, filters, sortDirection]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveSearch(searchInput.trim());
      setShowResults(true);
    }
  };

  const handleGenreClick = (genre: string) => {
    setFilters(prev => ({ ...prev, genre }));
    setShowResults(true);
  };

  const handleInstrumentClick = (instrument: string) => {
    setFilters(prev => ({ ...prev, instrumentType: instrument }));
    setShowResults(true);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  const handleBackToDiscover = () => {
    setShowResults(false);
    setActiveSearch("");
    setSearchInput("");
    setFilters({
      genre: "all",
      instrumentType: "all",
      sampleType: "all",
      key: "all",
      sortBy: "popular",
    });
    setSamples([]);
  };

  // Landing / Discovery View
  if (!showResults) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-bold text-[#39b54a] italic mb-6">
              The world&apos;s best sample library.
            </h1>
            <Link href="/signup">
              <Button className="bg-[#39b54a] hover:bg-[#2da03e] text-black font-semibold px-8 py-3 rounded-full text-lg">
                Try now
              </Button>
            </Link>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mb-16">
            <div className="flex items-center bg-white rounded-full overflow-hidden max-w-3xl mx-auto">
              <div className="flex items-center flex-1 px-6 py-4">
                <Search className="w-5 h-5 text-gray-400 mr-3" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder='Search any sound, like "808 kick"'
                  className="flex-1 bg-transparent text-gray-900 placeholder-gray-500 outline-none text-lg"
                />
              </div>
              <button
                type="submit"
                className="bg-[#39b54a] hover:bg-[#2da03e] text-white font-semibold px-8 py-4 m-1 rounded-full transition"
              >
                Search
              </button>
            </div>
          </form>

          {/* Browse Genres */}
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-white mb-4">Browse genres</h2>
            <div className="flex flex-wrap gap-3">
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  onClick={() => handleGenreClick(genre)}
                  className="px-4 py-2 rounded-full border border-[#3a3a3a] text-white text-sm hover:border-[#39b54a] hover:text-[#39b54a] transition"
                >
                  {genre}
                </button>
              ))}
              <button
                onClick={() => {
                  setFilters(prev => ({ ...prev, genre: "all" }));
                  setShowResults(true);
                }}
                className="px-4 py-2 rounded-full border border-[#3a3a3a] text-[#a1a1a1] text-sm hover:border-[#39b54a] hover:text-[#39b54a] transition"
              >
                Explore All
              </button>
            </div>
          </div>

          {/* Browse Instruments */}
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-white mb-4">Browse instruments</h2>
            <div className="flex flex-wrap gap-3">
              {INSTRUMENTS.map((instrument) => (
                <button
                  key={instrument}
                  onClick={() => handleInstrumentClick(instrument)}
                  className="px-4 py-2 rounded-full border border-[#3a3a3a] text-white text-sm hover:border-[#39b54a] hover:text-[#39b54a] transition"
                >
                  {instrument}
                </button>
              ))}
              <button
                onClick={() => {
                  setFilters(prev => ({ ...prev, instrumentType: "all" }));
                  setShowResults(true);
                }}
                className="px-4 py-2 rounded-full border border-[#3a3a3a] text-[#a1a1a1] text-sm hover:border-[#39b54a] hover:text-[#39b54a] transition"
              >
                Explore All
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results View
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back + Search Header */}
        <div className="mb-6">
          <button
            onClick={handleBackToDiscover}
            className="text-sm text-[#a1a1a1] hover:text-white mb-4 flex items-center gap-1"
          >
            ← Back to discover
          </button>
          
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden max-w-2xl">
              <div className="flex items-center flex-1 px-4 py-3">
                <Search className="w-5 h-5 text-[#666] mr-3" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search samples..."
                  className="flex-1 bg-transparent text-white placeholder-[#666] outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-[#39b54a] hover:bg-[#2da03e] text-black font-semibold px-6 py-3 transition"
              >
                Search
              </button>
            </div>
          </form>
        </div>

        {/* Active Filters Display */}
        {(activeSearch || filters.genre !== "all" || filters.instrumentType !== "all") && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {activeSearch && (
              <span className="px-3 py-1 bg-[#39b54a]/20 border border-[#39b54a]/50 text-[#39b54a] rounded-full text-sm flex items-center gap-2">
                &quot;{activeSearch}&quot;
                <button onClick={() => setActiveSearch("")} className="hover:text-white">×</button>
              </span>
            )}
            {filters.genre !== "all" && (
              <span className="px-3 py-1 bg-[#39b54a]/20 border border-[#39b54a]/50 text-[#39b54a] rounded-full text-sm flex items-center gap-2">
                {filters.genre}
                <button onClick={() => setFilters(prev => ({ ...prev, genre: "all" }))} className="hover:text-white">×</button>
              </span>
            )}
            {filters.instrumentType !== "all" && (
              <span className="px-3 py-1 bg-[#39b54a]/20 border border-[#39b54a]/50 text-[#39b54a] rounded-full text-sm flex items-center gap-2">
                {filters.instrumentType}
                <button onClick={() => setFilters(prev => ({ ...prev, instrumentType: "all" }))} className="hover:text-white">×</button>
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <SampleFilters onFilterChange={handleFilterChange} />

        {/* CTA Banner for non-logged-in users */}
        {!user && (
          <div className="mb-6 p-4 bg-gradient-to-r from-[#39b54a]/20 to-[#1a1a1a] border border-[#39b54a]/30 rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <p className="text-white">
                <span className="font-semibold">Subscribe to download.</span>{" "}
                <span className="text-[#a1a1a1]">Get unlimited access to all samples.</span>
              </p>
              <Link href="/signup">
                <Button className="bg-[#39b54a] hover:bg-[#2da03e] text-black font-semibold">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#a1a1a1]">
              {total} sample{total !== 1 ? "s" : ""}
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
              <div className="grid grid-cols-[auto_1fr_80px] md:grid-cols-[auto_1fr_90px_45px_45px_80px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
                <div className="w-10" />
                <SortHeader column="name" label="Name" />
                <div className="hidden md:block"><SortHeader column="genre" label="Genre" /></div>
                <div className="hidden md:block"><SortHeader column="key" label="Key" /></div>
                <div className="hidden md:block"><SortHeader column="bpm" label="BPM" /></div>
                <div className="hidden md:block"><SortHeader column="rating" label="★" /></div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-[#2a2a2a]">
                {samples.map((sample) => (
                  <ExploreRow
                    key={sample.id}
                    sample={sample}
                  />
                ))}
              </div>

              {/* Load more */}
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
      </div>
    </div>
  );
}

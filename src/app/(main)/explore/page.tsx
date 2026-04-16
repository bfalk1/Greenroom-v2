"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sample, stopGlobalPlayback } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { ExploreRow } from "@/components/marketplace/ExploreRow";
import { SearchSuggestions } from "@/components/marketplace/SearchSuggestions";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const PAGE_SIZE = 20;

interface GenreOption {
  id: string;
  name: string;
}

interface InstrumentOption {
  id: string;
  name: string;
}

export default function ExplorePage() {
  const { user } = useUser();
  const [searchInput, setSearchInput] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
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
  const [genres, setGenres] = useState<string[]>([]);
  const [instruments, setInstruments] = useState<string[]>([]);
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

  useEffect(() => {
    const fetchBrowseOptions = async () => {
      try {
        const [genresRes, instrumentsRes] = await Promise.all([
          fetch("/api/genres?usedOnly=true"),
          fetch("/api/instruments?usedOnly=true"),
        ]);

        if (genresRes.ok) {
          const data = await genresRes.json();
          setGenres((data.genres || []).map((genre: GenreOption) => genre.name));
        }

        if (instrumentsRes.ok) {
          const data = await instrumentsRes.json();
          setInstruments((data.instruments || []).map((instrument: InstrumentOption) => instrument.name));
        }
      } catch (error) {
        console.error("Failed to fetch explore options:", error);
      }
    };

    fetchBrowseOptions();
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12 rounded-[32px] border border-[#2a2a2a] bg-[radial-gradient(circle_at_top,rgba(57,181,74,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-6 py-12 md:px-12 md:py-16 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <span className="inline-flex items-center rounded-full border border-[#39b54a]/30 bg-[#39b54a]/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-[#8ee39a]">
              Discover sounds faster
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Find the right sample for your next track.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#b3b3b3] md:text-base">
              Search across real creator uploads, preview instantly, and explore by genre or instrument without leaving the page.
            </p>
            <Link href="/signup">
              <Button className="mt-8 h-12 rounded-full bg-[#39b54a] px-7 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(57,181,74,0.28)] transition hover:bg-[#4bc75d]">
                Start exploring
              </Button>
            </Link>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mb-16">
            <div className="relative mx-auto max-w-3xl">
              <div className="flex items-center rounded-2xl border border-[#2a2a2a] bg-[#111111]/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur">
                <div className="flex items-center flex-1 px-4 py-3">
                  <Search className="mr-3 h-5 w-5 text-[#666]" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder='Search sounds, creators, or moods like "dark trap 808"'
                    className="flex-1 bg-transparent text-base text-white placeholder-[#6f6f6f] outline-none md:text-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[#39b54a] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#4bc75d] md:px-8"
                >
                  Search
                </button>
              </div>
              <SearchSuggestions
                query={searchInput}
                visible={searchFocused}
                onSelect={(value) => {
                  setSearchInput(value);
                  setSearchFocused(false);
                  setActiveSearch(value);
                  setShowResults(true);
                }}
                onClose={() => setSearchFocused(false)}
              />
            </div>
          </form>

          {/* Browse Genres */}
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-white mb-4">Browse genres</h2>
            <div className="flex flex-wrap gap-3">
              {genres.map((genre) => (
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
              {instruments.map((instrument) => (
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

        {showResults && (
          <div className="mt-16">
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

            <div className="mb-6">
              <SampleFilters onFilterChange={handleFilterChange} />
            </div>

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
        )}
      </div>
    </div>
  );
}

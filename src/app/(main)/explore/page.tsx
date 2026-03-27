"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Loader2, ChevronUp, ChevronDown, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sample, toggleGlobalPlay, stopGlobalPlayback } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";
import { ExploreRow } from "@/components/marketplace/ExploreRow";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const PAGE_SIZE = 20;

export default function ExplorePage() {
  const { user } = useUser();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Handle Escape to stop playback
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
        if (searchQuery) params.set("search", searchQuery);
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
    [searchQuery, filters, sortDirection, samples]
  );

  useEffect(() => {
    setHasMore(true);
  }, [filters, searchQuery]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

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
  }, [loading, loadingMore, samples.length, total, hasMore, fetchSamples]);

  useEffect(() => {
    fetchSamples(0, false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSamples(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, sortDirection]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 pt-4">
          <h1 className="text-3xl font-bold text-white mb-2">Explore Samples</h1>
          <p className="text-[#a1a1a1]">
            Preview thousands of royalty-free samples from top creators
          </p>
        </div>

        {/* CTA Banner */}
        <div className="mb-8 p-6 bg-gradient-to-r from-[#39b54a]/20 to-[#1a1a1a] border border-[#39b54a]/30 rounded-xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#39b54a]/20 rounded-full">
                <Lock className="w-6 h-6 text-[#39b54a]" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Unlock Full Access</h3>
                <p className="text-sm text-[#a1a1a1]">
                  Subscribe to download samples, build your library, and follow your favorite creators
                </p>
              </div>
            </div>
            <Link href={user ? "/pricing" : "/signup"}>
              <Button className="bg-[#39b54a] hover:bg-[#2da03e] text-black font-semibold px-6">
                {user ? "View Plans" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
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

        {/* Filters */}
        <SampleFilters onFilterChange={handleFilterChange} />

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

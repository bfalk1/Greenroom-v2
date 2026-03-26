"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Download, Loader2, CheckSquare, Square, Package, Play, Pause, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { toast } from "sonner";
import { Waveform } from "@/components/audio/Waveform";
import { SampleRating } from "@/components/marketplace/SampleRating";
import JSZip from "jszip";

interface LibrarySample {
  id: string;
  name: string;
  slug: string;
  creator_id: string;
  artist_name: string;
  genre: string;
  instrument_type: string;
  sample_type: string;
  key: string | null;
  bpm: number | null;
  credit_price: number;
  tags: string[];
  file_url: string;
  signed_url: string | null;
  filename: string;
  download_path: string;
  preview_url: string | null;
  cover_image_url: string | null;
  waveform_data?: number[] | null;
  average_rating: number;
  total_ratings: number;
  purchased_at: string;
}

// Global audio state for library
let libraryAudio: HTMLAudioElement | null = null;
let libraryPlayingId: string | null = null;
const librarySetters = new Map<string, (playing: boolean) => void>();

function getLibraryAudio() {
  if (typeof window === "undefined") return null;
  if (!libraryAudio) {
    libraryAudio = new Audio();
    libraryAudio.addEventListener("ended", () => {
      if (libraryPlayingId) {
        librarySetters.get(libraryPlayingId)?.(false);
      }
      libraryPlayingId = null;
    });
  }
  return libraryAudio;
}

// Library Row Component - matches Marketplace grid
function LibraryRow({
  sample,
  user,
  userRating,
  isSelected,
  onSelect,
  isChecked,
}: {
  sample: LibrarySample;
  user: { id: string; email?: string } | null;
  userRating?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isChecked: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const progressRef = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Register setter
  useEffect(() => {
    librarySetters.set(sample.id, setIsPlayingState);
    return () => {
      librarySetters.delete(sample.id);
      if (libraryPlayingId === sample.id) {
        getLibraryAudio()?.pause();
        libraryPlayingId = null;
      }
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [sample.id]);

  // Track progress
  useEffect(() => {
    const audio = getLibraryAudio();
    if (!audio) return;

    const updateProgress = () => {
      if (libraryPlayingId === sample.id && audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (isPlayingState) {
        progressRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlayingState) {
      progressRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [isPlayingState, sample.id]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const audio = getLibraryAudio();
    if (!audio) return;

    if (libraryPlayingId === sample.id) {
      audio.pause();
      setIsPlayingState(false);
      libraryPlayingId = null;
      setProgress(0);
      return;
    }

    if (libraryPlayingId) {
      librarySetters.get(libraryPlayingId)?.(false);
      audio.pause();
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}/preview`);
      const data = await res.json();
      if (res.ok && data.url) {
        audio.src = data.url;
        audio.currentTime = 0;
        setProgress(0);
        await audio.play();
        libraryPlayingId = sample.id;
        setIsPlayingState(true);
      }
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;
    
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
      a.download = sample.filename || `${sample.name}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded!");
    } catch (error) {
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[auto_auto_1fr_80px_60px] md:grid-cols-[auto_auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors ${
        isSelected
          ? "bg-[#39b54a]/10"
          : isPlayingState
          ? "bg-[#39b54a]/5"
          : "hover:bg-[#242424]"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect(sample.id);
        }}
        className="flex-shrink-0"
      >
        {isChecked ? (
          <CheckSquare className="w-4 h-4 text-[#39b54a]" />
        ) : (
          <Square className="w-4 h-4 text-[#3a3a3a] hover:text-white" />
        )}
      </button>

      {/* Cover Art + Play Button */}
      <div className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group">
        <img
          src={sample.cover_image_url || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=80&h=80&fit=crop"}
          alt={sample.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=80&h=80&fit=crop";
          }}
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
            <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />
          ) : isPlayingState ? (
            <Pause className="w-4 h-4 fill-current text-[#39b54a]" />
          ) : (
            <Play className="w-4 h-4 fill-current text-white opacity-0 group-hover:opacity-100 transition ml-0.5" />
          )}
        </button>
      </div>

      {/* Name + Artist + Tags + Waveform */}
      <div className="min-w-0 flex items-center gap-4 flex-1">
        <div className="min-w-0 w-[250px] flex-shrink-0">
          <p className="text-sm font-medium text-white truncate" title={sample.name}>{sample.name}</p>
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
              className="text-xs text-[#666] hover:text-[#39b54a] truncate transition flex-shrink-0"
            >
              {sample.artist_name || "Unknown"}
            </Link>
            {sample.tags && sample.tags.length > 0 && (
              <div className="flex items-center gap-1 overflow-hidden">
                {sample.tags.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2a2a2a] text-[#888] whitespace-nowrap"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Waveform */}
        <div className="hidden md:block flex-1 min-w-[150px] max-w-[350px]">
          <Waveform
            audioUrl={sample.preview_url || undefined}
            data={sample.waveform_data || undefined}
            isPlaying={isPlayingState}
            progress={progress}
            height={36}
            barWidth={2}
            barGap={1}
            barColor={isPlayingState ? "#4a4a4a" : "#3a3a3a"}
            progressColor="#39b54a"
          />
        </div>
      </div>

      {/* Genre */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {sample.genre || "—"}
      </span>

      {/* Key */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.key || "—"}</span>

      {/* BPM */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.bpm || "—"}</span>

      {/* Rating */}
      <div className="hidden md:flex items-center justify-center">
        <SampleRating
          sample={{
            id: sample.id,
            name: sample.name,
            creator_id: sample.creator_id,
            genre: sample.genre,
            credit_price: sample.credit_price,
            average_rating: sample.average_rating,
            total_ratings: sample.total_ratings,
          }}
          user={user}
          isOwned={true}
          initialRating={userRating}
          compact
        />
      </div>

      {/* Download Button */}
      <div className="flex items-center justify-end">
        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          size="sm"
          className="h-7 w-7 p-0 bg-[#39b54a] text-black hover:bg-[#2e9140]"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function LibraryPage() {
  const { user, loading: userLoading } = useUser();
  const [samples, setSamples] = useState<LibrarySample[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
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

  const selectAll = () => {
    if (selectedIds.size === samples.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(samples.map(s => s.id)));
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;
    
    setBulkDownloading(true);
    try {
      const selectedSamples = samples.filter(s => selectedIds.has(s.id));
      const zip = new JSZip();
      
      for (const sample of selectedSamples) {
        toast.loading(`Fetching ${sample.name}...`, { id: `dl-${sample.id}` });
        const res = await fetch(`/api/downloads/${sample.id}`);
        if (res.ok) {
          const blob = await res.blob();
          zip.file(sample.download_path, blob);
          toast.success(`Added ${sample.name}`, { id: `dl-${sample.id}` });
        } else {
          toast.error(`Failed: ${sample.name}`, { id: `dl-${sample.id}` });
        }
      }
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Greenroom_${selectedSamples.length}_samples.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${selectedSamples.length} samples!`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Bulk download error:", error);
      toast.error("Bulk download failed");
    } finally {
      setBulkDownloading(false);
    }
  };

  // Fetch library with pagination
  const fetchLibrary = useCallback(async (offset = 0, append = false) => {
    if (!user) return;
    
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
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/library?${params}`);
      const data = await res.json();

      if (data.samples) {
        if (append) {
          setSamples(prev => [...prev, ...data.samples]);
        } else {
          setSamples(data.samples);
        }
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Error fetching library:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, searchQuery]);

  // Initial load
  useEffect(() => {
    if (!user) return;
    fetchLibrary(0);
    fetch("/api/ratings").then(res => res.json()).then(data => {
      if (data.ratings) setUserRatings(data.ratings);
    });
  }, [user, fetchLibrary]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && samples.length < total) {
          fetchLibrary(samples.length, true);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, samples.length, total, fetchLibrary]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) fetchLibrary(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard navigation
  const { selectedIndex } = useKeyboardNavigation(samples, {
    enabled: samples.length > 0 && !loading,
    onPlay: () => {},
  });

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Library</h1>
          <p className="text-[#a1a1a1]">
            {total} sample{total !== 1 ? "s" : ""} purchased
          </p>
        </div>

        {samples.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3 w-5 h-5 text-[#a1a1a1]" />
                <Input
                  type="text"
                  placeholder="Search your library..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
                />
              </div>
              
              {selectedIds.size > 0 && (
                <Button
                  onClick={handleBulkDownload}
                  disabled={bulkDownloading}
                  className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                >
                  {bulkDownloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4 mr-2" />
                  )}
                  Download {selectedIds.size}
                </Button>
              )}
            </div>
          </div>
        )}

        {samples.length > 0 ? (
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_auto_1fr_80px_60px] md:grid-cols-[auto_auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
              <button onClick={selectAll} className="flex-shrink-0">
                {selectedIds.size === samples.length && samples.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-[#39b54a]" />
                ) : (
                  <Square className="w-4 h-4 text-[#3a3a3a] hover:text-white" />
                )}
              </button>
              <div className="w-10" />
              <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Key</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">BPM</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1] text-center">★</span>
              <span className="text-xs font-medium text-[#a1a1a1]"></span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#2a2a2a]">
              {samples.map((sample, index) => (
                <LibraryRow
                  key={sample.id}
                  sample={sample}
                  user={user}
                  userRating={userRatings[sample.id]}
                  isSelected={selectedIndex === index}
                  onSelect={toggleSelect}
                  isChecked={selectedIds.has(sample.id)}
                />
              ))}
            </div>

            {/* Load more sentinel */}
            {samples.length < total && (
              <div ref={loadMoreRef} className="flex justify-center py-6 border-t border-[#2a2a2a]">
                {loadingMore ? (
                  <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
                ) : (
                  <span className="text-sm text-[#666]">Scroll for more...</span>
                )}
              </div>
            )}
          </div>
        ) : samples.length > 0 ? (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
            <p className="text-[#a1a1a1]">No samples match your search.</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Your library is empty
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Purchase samples from the marketplace to add them here.
            </p>
            <Link href="/marketplace">
              <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
                Browse Marketplace
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

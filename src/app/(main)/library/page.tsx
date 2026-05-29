"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Download, Loader2, Package, Play, Pause, GripVertical, HardDrive, Square, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useDesktopSampleDrag } from "@/hooks/useDesktopSampleDrag";
import { trackLibraryViewed } from "@/lib/analytics";
import { toast } from "sonner";
import { Waveform } from "@/components/audio/Waveform";
import { SampleRating } from "@/components/marketplace/SampleRating";
import {
  getSampleTableRowClass,
  SAMPLE_TABLE_WAVEFORM_CLASS,
  SampleTableHeader,
} from "@/components/marketplace/SampleTable";
import {
  getGlobalAudio,
  getGlobalPlayingId,
  globalSetters,
  globalToggleFns,
  setGlobalPlayingId,
  toggleGlobalPlay,
} from "@/components/marketplace/SampleCard";
import { setNowPlayingQueue, setNowPlayingTrack, setQueueNavigation } from "@/lib/audio/nowPlaying";
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

// Library Row Component - matches Marketplace grid
function LibraryRow({
  sample,
  user,
  userRating,
  isSelected,
  onSelect,
  isChecked,
  statusRefreshKey,
}: {
  sample: LibrarySample;
  user: { id: string; email?: string } | null;
  userRating?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isChecked: boolean;
  statusRefreshKey: number;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const {
    isDesktop,
    isSyncing,
    isLocal,
    isDragging,
    dragHandleKey,
    canDrag,
    handlePointerDown,
    handlePointerUp,
  } = useDesktopSampleDrag({
    sampleId: sample.id,
    sampleName: sample.name,
    artistName: sample.artist_name,
    enabled: true,
    refreshKey: statusRefreshKey,
  });

  const handleRowMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [role="button"], [data-no-drag]')) return;
    handlePointerDown(e);
  }, [isDesktop, handlePointerDown]);

  const startPlayback = useCallback(async () => {
    const audio = getGlobalAudio();
    if (!audio) return false;

    if (getGlobalPlayingId() === sample.id) return true;

    const previousPlayingId = getGlobalPlayingId();
    if (previousPlayingId) {
      globalSetters.get(previousPlayingId)?.(false);
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
        setGlobalPlayingId(sample.id);
        setIsPlayingState(true);
        setNowPlayingTrack({
          id: sample.id,
          name: sample.name,
          artistName: sample.artist_name,
          coverUrl: sample.cover_image_url || undefined,
          artistSlug: sample.artist_name || sample.creator_id,
        });
        return true;
      }
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
    return false;
  }, [sample.id, sample.name, sample.artist_name, sample.cover_image_url, sample.creator_id]);

  const togglePlayFn = useCallback(async () => {
    const audio = getGlobalAudio();
    if (!audio) return;

    if (getGlobalPlayingId() === sample.id) {
      audio.pause();
      setIsPlayingState(false);
      setGlobalPlayingId(null);
      setProgress(0);
      return;
    }

    await startPlayback();
  }, [sample.id, startPlayback]);

  // Register setter / toggle for global audio control
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
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [sample.id, togglePlayFn]);

  // Track progress
  useEffect(() => {
    const audio = getGlobalAudio();
    if (!audio) return;

    const updateProgress = () => {
      if (getGlobalPlayingId() === sample.id && audio.duration) {
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
    await togglePlayFn();
  };

  const handleSeek = useCallback(async (percent: number) => {
    const audio = getGlobalAudio();
    if (!audio) return;

    const seekToPercent = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        audio.currentTime = (audio.duration * percent) / 100;
        setProgress(percent);
      }
    };

    if (getGlobalPlayingId() === sample.id) {
      seekToPercent();
      return;
    }

    const ok = await startPlayback();
    if (!ok || getGlobalPlayingId() !== sample.id) return;

    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      seekToPercent();
    } else {
      const onMeta = () => {
        seekToPercent();
        audio.removeEventListener("loadedmetadata", onMeta);
      };
      audio.addEventListener("loadedmetadata", onMeta);
    }
  }, [sample.id, startPlayback]);

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
    } catch {
      toast.error("Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      ref={rowRef}
      className={`${getSampleTableRowClass("library", {
        isActive: isSelected || isPlayingState,
        isDragging,
      })}${canDrag ? " cursor-grab active:cursor-grabbing" : ""}`}
      style={{ WebkitUserSelect: "none" } as React.CSSProperties}
      onMouseDown={handleRowMouseDown}
      onMouseUp={isDesktop ? handlePointerUp : undefined}
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

      {/* Drag Handle (visual indicator) */}
      <div
        key={dragHandleKey}
        className={`w-6 h-10 flex items-center justify-center transition ${
          !isDesktop
            ? "invisible"
            : isSyncing
            ? "text-[#39b54a]"
            : canDrag
            ? "text-[#39b54a] hover:text-white"
            : "text-[#3a3a3a] hover:text-[#39b54a]"
        }`}
        title={
          !isDesktop
            ? ""
            : isSyncing
            ? "Syncing sample locally..."
            : isLocal
            ? "Drag to DAW"
            : "Sync sample locally"
        }
      >
        {isDesktop &&
          (isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isLocal ? (
            <GripVertical className="w-4 h-4" />
          ) : !isLocal ? (
            <HardDrive className="w-4 h-4" />
          ) : null)}
      </div>

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

      {/* Name + Artist + Tags */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white" title={sample.name}>{sample.name}</p>
        <div className="min-w-0 flex flex-col items-start gap-1 lg:flex-row lg:items-center lg:gap-2">
          <Link
            href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
            className="max-w-full truncate text-xs text-[#39b54a] hover:text-[#2da03e] transition"
          >
            {sample.artist_name || "Unknown"}
          </Link>
          {sample.tags && sample.tags.length > 0 && (
            <div className="hidden min-w-0 lg:flex items-center gap-1 overflow-hidden">
              {sample.tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="max-w-[96px] truncate text-[10px] px-1.5 py-0.5 rounded-full border border-[#39b54a]/50 text-[#39b54a] whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Waveform */}
      <div className={SAMPLE_TABLE_WAVEFORM_CLASS} data-no-drag>
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
          onSeek={handleSeek}
        />
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
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [localStatusRefreshKey, setLocalStatusRefreshKey] = useState(0);
  const hasFetchedInitiallyRef = useRef(false);

  const fetchAllLibrarySamples = useCallback(async () => {
    const allSamples: LibrarySample[] = [];
    let offset = 0;
    let totalCount = 0;

    do {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (searchQuery) {
        params.set("search", searchQuery);
      }

      const res = await fetch(`/api/library?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch full library for sync");
      }

      const pageSamples: LibrarySample[] = data.samples || [];
      totalCount = typeof data.total === "number" ? data.total : pageSamples.length;
      allSamples.push(...pageSamples);

      if (pageSamples.length === 0) {
        break;
      }

      offset += pageSamples.length;
    } while (allSamples.length < totalCount);

    return allSamples;
  }, [searchQuery]);

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

  const selectAll = async () => {
    if (selectedIds.size === total && total > 0) {
      setSelectedIds(new Set());
      return;
    }

    try {
      const allSamples = await fetchAllLibrarySamples();
      setSelectedIds(new Set(allSamples.map((sample) => sample.id)));
    } catch (error) {
      console.error("Error selecting all library samples:", error);
      toast.error("Failed to select all samples");
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;
    
    setBulkDownloading(true);
    try {
      const selectedSamples =
        selectedIds.size > samples.length
          ? (await fetchAllLibrarySamples()).filter((sample) => selectedIds.has(sample.id))
          : samples.filter((sample) => selectedIds.has(sample.id));
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

  // Fetch a specific page of the user's library
  const fetchLibrary = useCallback(async (page: number) => {
    if (!user) return;

    setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/library?${params}`);
      const data = await res.json();

      if (data.samples) {
        if (!hasFetchedInitiallyRef.current) {
          trackLibraryViewed(data.total);
          hasFetchedInitiallyRef.current = true;
        }
        setSamples(data.samples);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Error fetching library:", error);
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Initial ratings load
  useEffect(() => {
    if (!user) return;
    fetch("/api/ratings").then(res => res.json()).then(data => {
      if (data.ratings) setUserRatings(data.ratings);
    });
  }, [user]);

  // Reset to first page on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Register library samples as the now-playing queue for prev/next.
  useEffect(() => {
    setNowPlayingQueue(
      samples.map((s) => ({
        id: s.id,
        name: s.name,
        artistName: s.artist_name,
        coverUrl: s.cover_image_url || undefined,
        artistSlug: s.artist_name || s.creator_id,
      }))
    );
  }, [samples]);

  useEffect(() => () => setNowPlayingQueue([]), []);

  // Cross-page navigation: bar prev/next at edges + ArrowDown/ArrowUp at edges
  // advance pagination and auto-play the new page's first/last item.
  const pendingPlayRef = useRef<"first" | "last" | null>(null);

  const goToNextPage = useCallback(() => {
    if (currentPage >= totalPages) return;
    pendingPlayRef.current = "first";
    setCurrentPage((p) => p + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage <= 1) return;
    pendingPlayRef.current = "last";
    setCurrentPage((p) => p - 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  useEffect(() => {
    if (loading || samples.length === 0 || !pendingPlayRef.current) return;
    const direction = pendingPlayRef.current;
    pendingPlayRef.current = null;
    const target = direction === "first" ? samples[0] : samples[samples.length - 1];
    if (!target) return;
    setTimeout(() => toggleGlobalPlay(target.id), 0);
  }, [samples, loading]);

  useEffect(() => {
    setQueueNavigation({
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      onPrevPage: goToPrevPage,
      onNextPage: goToNextPage,
    });
  }, [currentPage, totalPages, goToPrevPage, goToNextPage]);

  useEffect(() => () => setQueueNavigation({}), []);

  // Refresh per-row local status when the layout-level sync (DesktopLibrarySync)
  // pulls down newly purchased samples while the library page is open.
  useEffect(() => {
    const onSyncComplete = () => setLocalStatusRefreshKey((prev) => prev + 1);
    window.addEventListener("greenroom:library-sync-complete", onSyncComplete);
    return () => window.removeEventListener("greenroom:library-sync-complete", onSyncComplete);
  }, []);

  // Debounced fetch on search/page/user change
  useEffect(() => {
    if (!user) return;
    const delay = hasFetchedInitiallyRef.current ? 300 : 0;
    const timer = setTimeout(() => {
      fetchLibrary(currentPage);
    }, delay);
    return () => clearTimeout(timer);
  }, [fetchLibrary, searchQuery, user, currentPage]);

  // Keyboard navigation
  const { selectedIndex } = useKeyboardNavigation(samples, {
    enabled: samples.length > 0 && !loading,
    onPlay: () => {},
    onReachEnd: () => goToNextPage(),
    onReachStart: () => goToPrevPage(),
  });

  if (userLoading || (loading && !hasFetchedInitiallyRef.current)) {
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
            <SampleTableHeader
              variant="library"
              onToggleAll={selectAll}
              allSelected={selectedIds.size === total && total > 0}
            />

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
                  statusRefreshKey={localStatusRefreshKey}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="border-t border-[#2a2a2a] flex flex-col items-center gap-2 py-6">
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

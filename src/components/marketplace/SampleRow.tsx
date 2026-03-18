"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Play, Pause, Heart, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sample, getGlobalPlayingId, getGlobalAudio, globalSetters, globalToggleFns, setGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { Waveform } from "@/components/audio/Waveform";
import { SampleRating } from "@/components/marketplace/SampleRating";
import { toast } from "sonner";

export interface SampleRowProps {
  sample: Sample;
  user: { id: string; email?: string; credits?: number; subscription_status?: string; is_creator?: boolean; role?: string } | null;
  isOwned: boolean;
  isFavorited?: boolean;
  userRating?: number;
  isSelected?: boolean;
  showArtist?: boolean;
  onPurchase: (sample: Sample) => void;
  onFavoriteChange?: (sampleId: string, favorited: boolean) => void;
  refreshUser: () => void;
}

export function SampleRow({
  sample,
  user,
  isOwned,
  isFavorited: isFavoritedProp = false,
  userRating,
  isSelected = false,
  showArtist = true,
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
  const [progress, setProgress] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number | null>(null);

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
      setProgress(0);
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
      setProgress(0);
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
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [sample.id, togglePlayFn]);

  // Track progress for waveform
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
    } else {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
      if (getGlobalPlayingId() !== sample.id) setProgress(0);
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
      onFavoriteChange?.(sample.id, data.favorited);
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
      className={`grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors ${
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

      {/* Name + Artist + Tags + Waveform */}
      <div className="min-w-0 flex items-center gap-4 flex-1">
        <div className="min-w-0 w-[280px] flex-shrink-0">
          <p className="text-sm font-medium text-white truncate" title={sample.name}>{sample.name}</p>
          <div className="flex items-center gap-2 min-w-0">
            {showArtist ? (
              <Link
                href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
                className="text-xs text-[#666] hover:text-[#00FF88] truncate transition flex-shrink-0"
              >
                {sample.artist_name || "Unknown"}
              </Link>
            ) : (
              <span className="text-xs text-[#666] truncate flex-shrink-0">{sample.genre || "Sample"}</span>
            )}
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
        {/* Waveform - fills remaining space */}
        <div className="hidden md:block flex-1 min-w-[200px] max-w-[400px]">
          <Waveform
            audioUrl={sample.preview_url}
            data={sample.waveform_data || undefined}
            isPlaying={isPlayingState}
            progress={progress}
            height={36}
            barWidth={2}
            barGap={1}
            barColor={isPlayingState ? "#4a4a4a" : "#3a3a3a"}
            progressColor="#00FF88"
          />
        </div>
      </div>

      {/* Genre - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {sample.genre || "—"}
      </span>

      {/* Key - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.key || "—"}</span>

      {/* BPM - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.bpm || "—"}</span>

      {/* Rating - hidden on mobile */}
      <div className="hidden md:flex items-center justify-center">
        {isOwned ? (
          <SampleRating
            sample={sample}
            user={user}
            isOwned={isOwned}
            initialRating={userRating}
            compact
          />
        ) : sample.average_rating ? (
          <span className="text-sm text-[#a1a1a1] flex items-center gap-1">
            <span className="text-yellow-500">★</span>
            {sample.average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-[#3a3a3a]">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleFavorite}
          disabled={isFavoriting}
          className={`p-1.5 rounded transition ${
            isFavorited ? "text-red-500" : "text-[#3a3a3a] hover:text-red-500"
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
        </button>

        <div className="relative group">
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
          >
            {isPurchasing || isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isOwned ? (
              <Download className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
          {!isOwned && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-xs text-[#00FF88] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
              {sample.credit_price} cr
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Table header component for consistency
export function SampleTableHeader({ sortable = false, onSort, sortBy, sortDir }: {
  sortable?: boolean;
  onSort?: (column: string) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}) {
  const SortHeader = ({ column, label }: { column: string; label: string }) => {
    if (!sortable || !onSort) {
      return <div className="text-xs font-medium text-[#a1a1a1]">{label}</div>;
    }
    
    const isActive = sortBy === column;
    return (
      <button
        onClick={() => onSort(column)}
        className={`text-xs font-medium flex items-center gap-1 transition ${
          isActive ? "text-[#00FF88]" : "text-[#a1a1a1] hover:text-white"
        }`}
      >
        {label}
        {isActive && (
          sortDir === "asc" ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )
        )}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
      <div className="w-10" /> {/* Play button column */}
      <SortHeader column="name" label="Name" />
      <div className="hidden md:block"><SortHeader column="genre" label="Genre" /></div>
      <div className="hidden md:block"><SortHeader column="key" label="Key" /></div>
      <div className="hidden md:block"><SortHeader column="bpm" label="BPM" /></div>
      <div className="hidden md:block"><SortHeader column="rating" label="★" /></div>
      <div className="text-xs font-medium text-[#a1a1a1]"></div>
    </div>
  );
}

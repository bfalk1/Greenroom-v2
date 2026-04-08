"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Play, Pause, Heart, Download, Plus, GripVertical, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sample, getGlobalPlayingId, getGlobalAudio, globalSetters, globalToggleFns, setGlobalPlayingId } from "@/components/marketplace/SampleCard";
import {
  getSampleTableRowClass,
  SAMPLE_TABLE_WAVEFORM_CLASS,
} from "@/components/marketplace/SampleTable";
import { Waveform } from "@/components/audio/Waveform";
import { SampleRating } from "@/components/marketplace/SampleRating";
import { useDesktopSampleDrag } from "@/hooks/useDesktopSampleDrag";
import { trackSamplePlay, trackSamplePause, trackSampleFavorite, trackSampleDownload } from "@/lib/analytics";
import { toast } from "sonner";

export { SampleTableHeader } from "@/components/marketplace/SampleTable";

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
  const playStartRef = useRef<number | null>(null);
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
    enabled: isOwned,
  });

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
      const duration = playStartRef.current ? Date.now() - playStartRef.current : 0;
      trackSamplePause(sample.id, duration);
      playStartRef.current = null;
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
      playStartRef.current = Date.now();
      trackSamplePlay({
        sampleId: sample.id,
        name: sample.name,
        artist: sample.artist_name || "Unknown",
        genre: sample.genre,
        source: "marketplace",
      });
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
      trackSampleDownload(sample.id, sample.name, "marketplace");
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
      trackSampleFavorite(sample.id, data.favorited);
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
      className={getSampleTableRowClass("browse", {
        isActive: isSelected || isPlayingState,
        isDragging,
      })}
      style={{ WebkitUserSelect: "none" } as React.CSSProperties}
    >
      {/* Drag Handle */}
      <div
        key={dragHandleKey}
        className={`w-6 h-10 flex items-center justify-center transition -ml-1 ${
          !isDesktop || !isOwned
            ? "invisible"
            : isSyncing
            ? "cursor-progress text-[#39b54a]"
            : canDrag
            ? "cursor-grab active:cursor-grabbing text-[#39b54a] hover:text-white"
            : "cursor-pointer text-[#3a3a3a] hover:text-[#39b54a]"
        }`}
        onMouseDown={isDesktop && isOwned ? handlePointerDown : undefined}
        onMouseUp={isDesktop && isOwned ? handlePointerUp : undefined}
        title={
          !isDesktop || !isOwned
            ? ""
            : isSyncing
            ? "Syncing sample locally..."
            : isLocal
            ? "Drag local sample to DAW"
            : "Sync sample locally"
        }
      >
        {isDesktop &&
          isOwned &&
          (isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isLocal ? (
            <GripVertical className="w-4 h-4" />
          ) : (
            <HardDrive className="w-4 h-4" />
          ))}
      </div>
      
      {/* Cover Art + Play Button */}
      <div 
        className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group"
      >
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
          {showArtist ? (
            <Link
              href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
              className="max-w-full truncate text-xs text-[#39b54a] hover:text-[#2da03e] transition"
            >
              {sample.artist_name || "Unknown"}
            </Link>
          ) : (
            <span className="max-w-full truncate text-xs text-[#39b54a]">{sample.genre || "Sample"}</span>
          )}
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
      <div className={SAMPLE_TABLE_WAVEFORM_CLASS}>
        <Waveform
          audioUrl={sample.preview_url}
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
                ? "bg-[#39b54a] text-black hover:bg-[#2e9140]"
                : (user?.credits ?? 0) < sample.credit_price
                ? "bg-[#2a2a2a] text-[#666] cursor-not-allowed"
                : "bg-[#2a2a2a] text-white hover:bg-[#39b54a] hover:text-black"
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
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-xs text-[#39b54a] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
              {sample.credit_price} cr
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

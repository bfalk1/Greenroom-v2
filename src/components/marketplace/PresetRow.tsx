"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Play, Pause, Heart, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGlobalPlayingId, getGlobalAudio, globalSetters, globalToggleFns, setGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { SampleRating } from "@/components/marketplace/SampleRating";
import { trackSamplePlay, trackSamplePause, trackSampleFavorite, trackSampleDownload } from "@/lib/analytics";
import { toast } from "sonner";

const SYNTH_DISPLAY_NAMES: Record<string, string> = {
  SERUM: "Serum",
  ASTRA: "Astra",
  SERUM_2: "Serum 2",
  PHASE_PLANT: "Phase Plant",
  SPLICE: "Splice",
  VITAL: "Vital",
  SYLENTH1: "Sylenth1",
  MASSIVE: "Massive",
  BEAT_MAKER: "Beat Maker",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  BASS: "Bass",
  LEAD: "Lead",
  PAD: "Pad",
  PLUCK: "Pluck",
  FX: "FX",
  KEYS: "Keys",
  ARP: "Arp",
  SEQUENCE: "Sequence",
  OTHER: "Other",
};

export interface Preset {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  creator_id: string;
  artist_name: string;
  creator_avatar?: string | null;
  synth_name: string;
  synth_display_name: string;
  preset_category: string;
  category_display_name: string;
  genre: string;
  tags: string[];
  credit_price: number;
  preview_url?: string | null;
  cover_image_url?: string | null;
  compatible_versions?: string[];
  is_init_preset?: boolean;
  average_rating: number;
  total_ratings: number;
  total_downloads: number;
  created_date: string;
}

export interface PresetRowProps {
  preset: Preset;
  user: { id: string; email?: string; credits?: number; subscription_status?: string; is_creator?: boolean; role?: string } | null;
  isOwned: boolean;
  isFavorited?: boolean;
  userRating?: number;
  isSelected?: boolean;
  onPurchase: (preset: Preset) => void;
  onFavoriteChange?: (presetId: string, favorited: boolean) => void;
}

export function PresetRow({
  preset,
  user,
  isOwned,
  isFavorited: isFavoritedProp = false,
  userRating,
  isSelected = false,
  onPurchase,
  onFavoriteChange,
}: PresetRowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(isFavoritedProp);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const playStartRef = useRef<number | null>(null);

  useEffect(() => {
    setIsFavorited(isFavoritedProp);
  }, [isFavoritedProp]);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);

  // Play/pause toggle for preset audio preview
  const togglePlayFn = useCallback(async () => {
    if (!preset.preview_url) {
      toast.error("No audio preview available for this preset");
      return;
    }

    const audio = getGlobalAudio();
    if (!audio) return;

    const currentPlayingId = getGlobalPlayingId();

    if (currentPlayingId === preset.id) {
      const duration = playStartRef.current ? Date.now() - playStartRef.current : 0;
      trackSamplePause(preset.id, duration);
      playStartRef.current = null;
      audio.pause();
      setIsPlayingState(false);
      setGlobalPlayingId(null);
      return;
    }

    if (currentPlayingId && currentPlayingId !== preset.id) {
      const prevSetter = globalSetters.get(currentPlayingId);
      prevSetter?.(false);
      audio.pause();
    }

    setIsLoading(true);
    try {
      audio.src = preset.preview_url;
      audio.currentTime = 0;
      await audio.play();
      setGlobalPlayingId(preset.id);
      setIsPlayingState(true);
      playStartRef.current = Date.now();
      trackSamplePlay({
        sampleId: preset.id,
        name: preset.name,
        artist: preset.artist_name || "Unknown",
        genre: preset.genre,
        source: "marketplace-presets",
      });
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [preset.id, preset.preview_url, preset.name, preset.artist_name, preset.genre]);

  useEffect(() => {
    globalSetters.set(preset.id, setIsPlayingState);
    globalToggleFns.set(preset.id, togglePlayFn);
    return () => {
      globalSetters.delete(preset.id);
      globalToggleFns.delete(preset.id);
      if (getGlobalPlayingId() === preset.id) {
        getGlobalAudio()?.pause();
        setGlobalPlayingId(null);
      }
    };
  }, [preset.id, togglePlayFn]);

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
      await onPurchase(preset);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user || !isOwned || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/downloads/preset/${preset.id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use content-disposition filename or generate from name
      const contentDisposition = res.headers.get("content-disposition");
      const filenameMatch = contentDisposition?.match(/filename="?(.+)"?/);
      a.download = filenameMatch?.[1] || `${preset.name}.fxp`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      trackSampleDownload(preset.id, preset.name, "marketplace-presets");
      toast.success(`Downloaded "${preset.name}"`);
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
        body: JSON.stringify({ presetId: preset.id }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
      const data = await res.json();
      setIsFavorited(data.favorited);
      onFavoriteChange?.(preset.id, data.favorited);
      trackSampleFavorite(preset.id, data.favorited);
      if (data.favorited) toast.success("Added to favorites");
    } catch {
      toast.error("Failed to update favorite");
    } finally {
      setIsFavoriting(false);
    }
  };

  const synthDisplay = SYNTH_DISPLAY_NAMES[preset.synth_name] || preset.synth_display_name;
  const categoryDisplay = CATEGORY_DISPLAY_NAMES[preset.preset_category] || preset.category_display_name;

  // Preset row uses a simpler grid than samples (no waveform, no key/bpm)
  // Columns: Play | Synth | Name+Artist+Tags | Category | Genre | Rating | Actions
  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_80px_1fr_80px_90px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors select-none ${
        isSelected || isPlayingState ? "bg-[#39b54a]/5" : "hover:bg-[#242424]"
      }`}
    >
      {/* Cover Art + Play Button */}
      <div
        className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group"
      >
        <img
          src={
            preset.cover_image_url ||
            preset.creator_avatar ||
            "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=80&h=80&fit=crop"
          }
          alt={preset.name}
          className="w-full h-full object-cover"
        />
        {preset.preview_url && (
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
        )}
      </div>

      {/* Synth Name - hidden on mobile */}
      <span className="hidden md:block text-xs font-medium text-[#39b54a] truncate">
        {synthDisplay}
      </span>

      {/* Name + Artist + Tags */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white" title={preset.name}>{preset.name}</p>
        <div className="min-w-0 flex flex-col items-start gap-1 lg:flex-row lg:items-center lg:gap-2">
          <Link
            href={`/artist/${encodeURIComponent(preset.artist_name || preset.creator_id)}`}
            className="max-w-full truncate text-xs text-[#39b54a] hover:text-[#2da03e] transition"
          >
            {preset.artist_name || "Unknown"}
          </Link>
          <span className="md:hidden text-[10px] text-[#666]">{synthDisplay}</span>
          {preset.tags && preset.tags.length > 0 && (
            <div className="hidden min-w-0 lg:flex items-center gap-1 overflow-hidden">
              {preset.tags.slice(0, 3).map((tag, i) => (
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

      {/* Category Badge */}
      <span className="hidden md:block text-xs text-[#a1a1a1] truncate">
        {categoryDisplay}
      </span>

      {/* Genre - hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {preset.genre || "\u2014"}
      </span>

      {/* Rating - hidden on mobile */}
      <div className="hidden md:flex items-center justify-center">
        {isOwned && user ? (
          <SampleRating
            sample={{
              id: preset.id,
              name: preset.name,
              average_rating: preset.average_rating,
              total_ratings: preset.total_ratings,
            } as any}
            user={user}
            isOwned={isOwned}
            initialRating={userRating}
            compact
          />
        ) : preset.average_rating ? (
          <span className="text-sm text-[#a1a1a1] flex items-center gap-1">
            <span className="text-yellow-500">&#9733;</span>
            {preset.average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-[#3a3a3a]">&mdash;</span>
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
            disabled={isPurchasing || isDownloading || !user || (!isOwned && (user?.credits ?? 0) < preset.credit_price)}
            size="sm"
            className={`h-7 w-7 p-0 ${
              isOwned
                ? "bg-[#39b54a] text-black hover:bg-[#2e9140]"
                : (user?.credits ?? 0) < preset.credit_price
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
              {preset.credit_price} cr
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

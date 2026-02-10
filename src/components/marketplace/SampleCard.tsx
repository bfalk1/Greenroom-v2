"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Play, Pause, Download, Heart, Check, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleRating } from "./SampleRating";

export interface Sample {
  id: string;
  name: string;
  creator_id: string;
  artist_name?: string;
  genre: string;
  instrument_type?: string;
  sample_type?: string;
  key?: string;
  bpm?: number;
  tags?: string[];
  credit_price: number;
  file_url?: string;
  cover_art_url?: string;
  status?: string;
  average_rating?: number;
  total_ratings?: number;
  total_purchases?: number;
  total_downloads?: number;
  created_date?: string;
}

export interface UserType {
  id: string;
  email?: string;
  credits?: number;
  subscription_status?: string;
  is_creator?: boolean;
  role?: string;
}

interface SampleCardProps {
  sample: Sample;
  user: UserType | null;
  isOwned?: boolean;
  onPurchase?: (sample: Sample) => void;
  onPlay?: (sampleId: string) => void;
  currentlyPlaying?: string | null;
}

// Global audio element shared across all cards
let globalAudio: HTMLAudioElement | null = null;
let globalPlayingId: string | null = null;
let globalSetters: Map<string, (playing: boolean) => void> = new Map();

function getGlobalAudio() {
  if (!globalAudio && typeof window !== "undefined") {
    globalAudio = new Audio();
    globalAudio.addEventListener("ended", () => {
      if (globalPlayingId) {
        const setter = globalSetters.get(globalPlayingId);
        setter?.(false);
        globalPlayingId = null;
      }
    });
  }
  return globalAudio;
}

export function SampleCard({ sample, user, isOwned: isOwnedProp, onPurchase }: SampleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isOwned, setIsOwned] = useState(isOwnedProp ?? false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOwnedProp !== undefined) {
      setIsOwned(isOwnedProp);
    }
  }, [isOwnedProp]);

  // Register this card's setter for global audio control
  useEffect(() => {
    globalSetters.set(sample.id, setIsPlaying);
    return () => {
      globalSetters.delete(sample.id);
      if (globalPlayingId === sample.id) {
        getGlobalAudio()?.pause();
        globalPlayingId = null;
      }
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [sample.id]);

  // Track progress
  useEffect(() => {
    const audio = getGlobalAudio();
    if (!audio) return;

    const updateProgress = () => {
      if (globalPlayingId === sample.id && audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (isPlaying) {
        progressRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlaying) {
      progressRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
      if (globalPlayingId !== sample.id) setProgress(0);
    }

    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [isPlaying, sample.id]);

  const togglePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const audio = getGlobalAudio();
    if (!audio) return;

    // If this sample is currently playing, pause it
    if (globalPlayingId === sample.id && isPlaying) {
      audio.pause();
      setIsPlaying(false);
      globalPlayingId = null;
      return;
    }

    // Stop any other playing sample
    if (globalPlayingId && globalPlayingId !== sample.id) {
      const prevSetter = globalSetters.get(globalPlayingId);
      prevSetter?.(false);
      audio.pause();
    }

    // Fetch preview URL
    setIsLoading(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}/preview`);
      const data = await res.json();

      if (!res.ok || !data.url) {
        console.error("Preview failed:", data.error);
        setIsLoading(false);
        return;
      }

      audio.src = data.url;
      audio.currentTime = 0;
      await audio.play();
      globalPlayingId = sample.id;
      setIsPlaying(true);
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isOwned || isPurchasing) return;

    setIsPurchasing(true);
    try {
      await onPurchase?.(sample);
      setIsOwned(true);
    } catch {
      // error handled by parent
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="relative">
      {/* Progress bar */}
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2a2a2a] z-10 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-[#00FF88] transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div
        className={`rounded-lg border transition-all duration-300 flex items-center p-3 gap-4 ${
          isPlaying
            ? "bg-[#1a1a1a] border-[#00FF88]/40"
            : "bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#00FF88]/50"
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Cover Art + Play */}
        <div className="relative w-14 h-14 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
          <img
            src={
              sample.cover_art_url ||
              "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop"
            }
            alt={sample.name}
            className="w-full h-full object-cover"
          />

          {(isHovered || isPlaying || isLoading) && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <button
                className="rounded-full bg-[#00FF88] text-black hover:bg-[#00cc6a] w-8 h-8 flex items-center justify-center transition"
                onClick={togglePlay}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate text-sm mb-1">
            {sample.name}
          </h3>
          <Link
            href={`/artist/${encodeURIComponent(sample.artist_name || sample.creator_id)}`}
            className="flex items-center gap-2 group w-fit"
            onClick={(e) => e.stopPropagation()}
          >
            <User className="w-3 h-3 text-[#a1a1a1] group-hover:text-[#00FF88] transition-colors" />
            <span className="text-xs text-[#a1a1a1] truncate group-hover:text-[#00FF88] transition-colors">
              {sample.artist_name || "Unknown Creator"}
            </span>
          </Link>
        </div>

        {/* Metadata */}
        <div className="hidden md:flex items-center gap-6 text-xs text-[#a1a1a1]">
          <span className="font-medium">{sample.genre}</span>
          <span>{sample.key || "—"}</span>
          {sample.bpm && <span>{sample.bpm} BPM</span>}
        </div>

        {/* Rating */}
        <div className="hidden lg:block">
          <SampleRating sample={sample} user={user} />
        </div>

        {/* Price & Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="bg-[#00FF88]/10 text-[#00FF88] px-3 py-1 rounded-full text-xs font-bold">
            {sample.credit_price} cr
          </div>
          <Button
            onClick={handlePurchase}
            disabled={isPurchasing || isOwned || !user}
            className={`text-sm font-medium h-8 px-4 ${
              isOwned
                ? "bg-[#1a1a1a] text-[#00FF88] border border-[#00FF88]/30 hover:bg-[#1a1a1a]"
                : "bg-[#00FF88] text-black hover:bg-[#00cc6a] disabled:opacity-50"
            }`}
          >
            {isPurchasing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : isOwned ? (
              <Check className="w-3.5 h-3.5 mr-1" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1" />
            )}
            {isPurchasing ? "..." : isOwned ? "Owned" : "Get"}
          </Button>
        </div>
      </div>
    </div>
  );
}

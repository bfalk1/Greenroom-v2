"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Play, Pause } from "lucide-react";
import { Sample, getGlobalPlayingId, getGlobalAudio, globalSetters, globalToggleFns, setGlobalPlayingId } from "@/components/marketplace/SampleCard";
import { Waveform } from "@/components/audio/Waveform";

export interface ExploreRowProps {
  sample: Sample;
}

export function ExploreRow({ sample }: ExploreRowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [progress, setProgress] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number | null>(null);

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

  return (
    <div
      ref={rowRef}
      className={`grid grid-cols-[auto_1fr_80px] md:grid-cols-[auto_1fr_90px_45px_45px_80px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors ${
        isPlayingState ? "bg-[#39b54a]/5" : "hover:bg-[#242424]"
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
        <div className="min-w-0 w-[320px] md:w-[380px] flex-shrink-0">
          <p className="text-sm font-medium text-white" title={sample.name}>{sample.name}</p>
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
            progressColor="#39b54a"
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

      {/* Rating display only (no interaction) */}
      <div className="hidden md:flex items-center justify-center">
        {sample.average_rating ? (
          <span className="text-sm text-[#a1a1a1] flex items-center gap-1">
            <span className="text-yellow-500">★</span>
            {sample.average_rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-[#3a3a3a]">—</span>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, User, Heart, Loader2 } from "lucide-react";
import { getGlobalAudio, getGlobalPlayingId, globalSetters, Sample } from "@/components/marketplace/SampleCard";

interface CurrentTrack {
  id: string;
  name: string;
  artist_name?: string;
  creator_id?: string;
  cover_art_url?: string;
  creator_avatar?: string;
}

export function GlobalAudioPlayer() {
  const [currentTrack, setCurrentTrack] = useState<CurrentTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const progressRef = useRef<number | null>(null);
  const lastPlayingIdRef = useRef<string | null>(null);

  // Poll for currently playing track
  useEffect(() => {
    const checkPlaying = () => {
      const playingId = getGlobalPlayingId();
      const audio = getGlobalAudio();

      if (playingId && audio && !audio.paused) {
        setIsVisible(true);
        setIsPlaying(true);
        setDuration(audio.duration || 0);
        setCurrentTime(audio.currentTime || 0);
        setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);

        // Fetch track info if changed
        if (playingId !== lastPlayingIdRef.current) {
          lastPlayingIdRef.current = playingId;
          fetchTrackInfo(playingId);
        }
      } else if (playingId && audio && audio.paused) {
        setIsPlaying(false);
      } else if (!playingId) {
        setIsPlaying(false);
        // Keep visible for a bit after stopping
        if (lastPlayingIdRef.current) {
          setTimeout(() => {
            if (!getGlobalPlayingId()) {
              setIsVisible(false);
              setCurrentTrack(null);
              lastPlayingIdRef.current = null;
            }
          }, 3000);
        }
      }
    };

    const interval = setInterval(checkPlaying, 100);
    return () => clearInterval(interval);
  }, []);

  const fetchTrackInfo = async (sampleId: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentTrack({
          id: data.id,
          name: data.name,
          artist_name: data.artist_name,
          creator_id: data.creator_id,
          cover_art_url: data.cover_art_url,
          creator_avatar: data.creator_avatar,
        });
      }
    } catch (err) {
      console.error("Failed to fetch track info:", err);
    }
  };

  const togglePlay = useCallback(() => {
    const audio = getGlobalAudio();
    const playingId = getGlobalPlayingId();
    if (!audio || !playingId) return;

    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
      const setter = globalSetters.get(playingId);
      setter?.(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      const setter = globalSetters.get(playingId);
      setter?.(false);
    }
  }, []);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = getGlobalAudio();
    if (!audio || !audio.duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
    setProgress(percent * 100);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = getGlobalAudio();
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (audio) {
      audio.volume = newVolume;
    }
  };

  const toggleMute = () => {
    const audio = getGlobalAudio();
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 1;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isVisible || !currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-56 right-0 h-20 bg-[#0a0a0a] border-t border-[#1a1a1a] z-40 flex items-center px-4">
      {/* Track Info */}
      <div className="flex items-center gap-3 w-72 flex-shrink-0">
        <div className="w-14 h-14 bg-[#1a1a1a] rounded overflow-hidden flex-shrink-0">
          <img
            src={
              currentTrack.cover_art_url ||
              currentTrack.creator_avatar ||
              "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop"
            }
            alt={currentTrack.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-white truncate">
            {currentTrack.name}
          </h4>
          <Link
            href={`/artist/${encodeURIComponent(currentTrack.artist_name || currentTrack.creator_id || "")}`}
            className="text-xs text-[#a1a1a1] hover:text-white truncate block"
          >
            {currentTrack.artist_name || "Unknown Artist"}
          </Link>
        </div>
        <button className="p-2 text-[#a1a1a1] hover:text-white transition">
          <Heart className="w-4 h-4" />
        </button>
      </div>

      {/* Player Controls */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto">
        {/* Buttons */}
        <div className="flex items-center gap-4 mb-2">
          <button className="text-[#a1a1a1] hover:text-white transition">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>
          <button className="text-[#a1a1a1] hover:text-white transition">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-[10px] text-[#a1a1a1] w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <div
            className="flex-1 h-1 bg-[#2a2a2a] rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-white group-hover:bg-[#39b54a] rounded-full relative transition-colors"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>
          <span className="text-[10px] text-[#a1a1a1] w-10">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-40 justify-end">
        <button onClick={toggleMute} className="text-[#a1a1a1] hover:text-white transition">
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-24 h-1 bg-[#2a2a2a] rounded-full cursor-pointer accent-white"
        />
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioPlayerProps {
  fileUrl?: string;
  sampleId?: string;
  duration?: number;
  useFullAudio?: boolean; // For mod/admin - use full file instead of preview
}

export function AudioPlayer({ fileUrl, sampleId, duration = 0, useFullAudio = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const getSignedUrl = async () => {
    if (sampleId) {
      // Use full audio endpoint for mods/admins, preview for regular users
      const endpoint = useFullAudio 
        ? `/api/mod/samples/${sampleId}/audio`
        : `/api/samples/${sampleId}/preview`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.url) return data.url;
    }
    // Fall back to direct URL if it's already a full URL
    if (fileUrl?.startsWith("http")) return fileUrl;
    return null;
  };

  const togglePlay = async () => {
    if (!sampleId && !fileUrl) {
      alert("Audio file not available");
      return;
    }

    // If we don't have a signed URL yet, fetch it
    if (!signedUrl) {
      setIsLoading(true);
      try {
        const url = await getSignedUrl();
        if (!url) {
          alert("Failed to load audio");
          setIsLoading(false);
          return;
        }
        setSignedUrl(url);
        // Wait for audio to be ready
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
          await audioRef.current.play();
          setIsPlaying(true);
        }
      } catch (err) {
        console.error("Failed to play:", err);
        alert("Failed to play audio");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Already have URL, just toggle play/pause
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#2a2a2a]">
      <audio ref={audioRef} />

      <div className="flex items-center gap-4 mb-4">
        <Button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-12 h-12 rounded-full bg-[#00FF88] text-black hover:bg-[#00cc6a] flex items-center justify-center"
        >
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current ml-0.5" />
          )}
        </Button>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs text-[#a1a1a1] w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleProgressChange}
            className="flex-1 h-1 bg-[#2a2a2a] rounded-full cursor-pointer"
          />
          <span className="text-xs text-[#a1a1a1] w-10">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Volume2 className="w-4 h-4 text-[#a1a1a1]" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          className="w-24 h-1 bg-[#2a2a2a] rounded-full cursor-pointer"
        />
      </div>
    </div>
  );
}

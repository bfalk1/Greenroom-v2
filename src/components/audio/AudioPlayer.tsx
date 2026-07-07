"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Only one AudioPlayer may play at a time; starting one pauses the previous.
let activeAudio: HTMLAudioElement | null = null;

interface AudioPlayerProps {
  fileUrl?: string;
  sampleId?: string;
  duration?: number;
  useFullAudio?: boolean; // For mod/admin - use full file instead of preview
  preload?: boolean; // Preload audio on mount
  hideVolume?: boolean; // Hide volume slider
  compact?: boolean; // Slim single-row variant for list items
}

export function AudioPlayer({ fileUrl, sampleId, duration = 0, useFullAudio = false, preload = false, hideVolume = false, compact = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(duration);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Refs (not state) so the mount-once media event handlers below always see
  // current values.
  const signedUrlRef = useRef<string | null>(null);
  const wantsPlayRef = useRef(false); // user pressed play (vs. preload)
  const retriedRef = useRef(false); // one expired-URL retry per play attempt

  const getSignedUrl = async () => {
    if (sampleId) {
      const endpoint = useFullAudio
        ? `/api/mod/samples/${sampleId}/audio`
        : `/api/samples/${sampleId}/preview`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.url) return data.url;
      }
    }
    if (fileUrl?.startsWith("http")) return fileUrl;
    return null;
  };

  // Preload audio on mount if requested
  useEffect(() => {
    if (preload && (sampleId || fileUrl) && !signedUrlRef.current) {
      getSignedUrl().then(url => {
        if (url) {
          signedUrlRef.current = url;
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.preload = "auto";
            audioRef.current.load();
          }
        }
      });
    }
  }, [preload, sampleId, fileUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTrackDuration(audio.duration);
      }
    };
    const handlePlay = () => {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    // Playback actually started, so the current URL works — allow a future
    // expired-URL retry.
    const handlePlaying = () => {
      retriedRef.current = false;
    };
    const handleError = () => {
      // Ignore errors outside a play attempt (e.g. preload failures).
      if (!wantsPlayRef.current) return;
      // Signed URLs expire after ~1h; if a previously fetched URL errors on a
      // later play attempt, re-fetch it once and retry. `playing` resets the
      // budget, so a genuinely broken source can't loop.
      if (sampleId && signedUrlRef.current && !retriedRef.current) {
        retriedRef.current = true;
        setIsLoading(true);
        getSignedUrl()
          .then(async (url) => {
            if (!url) throw new Error("No audio URL");
            signedUrlRef.current = url;
            audio.src = url;
            audio.load();
            await audio.play();
          })
          .catch((err) => {
            console.error("Failed to retry audio playback:", err);
            setIsPlaying(false);
            toast.error("Failed to play audio", { id: "audio-play-error" });
          })
          .finally(() => setIsLoading(false));
        return;
      }
      setIsLoading(false);
      setIsPlaying(false);
      toast.error("Failed to play audio", { id: "audio-play-error" });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleDuration);
    audio.addEventListener("durationchange", handleDuration);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleDuration);
      audio.removeEventListener("durationchange", handleDuration);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      // Detached audio elements keep playing in some browsers — stop explicitly.
      audio.pause();
      if (activeAudio === audio) activeAudio = null;
    };
  }, []);

  const togglePlay = async () => {
    if (!sampleId && !fileUrl) {
      toast.error("Audio file not available");
      return;
    }

    // If we don't have a signed URL yet, fetch it
    if (!signedUrlRef.current) {
      setIsLoading(true);
      try {
        const url = await getSignedUrl();
        if (!url) {
          toast.error("Failed to load audio");
          setIsLoading(false);
          return;
        }
        signedUrlRef.current = url;
        // Wait for audio to be ready
        if (audioRef.current) {
          wantsPlayRef.current = true;
          audioRef.current.src = url;
          audioRef.current.load();
          await audioRef.current.play();
        }
      } catch (err) {
        console.error("Failed to play:", err);
        toast.error("Failed to play audio", { id: "audio-play-error" });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Already have URL, just toggle play/pause
    if (audioRef.current) {
      if (isPlaying) {
        wantsPlayRef.current = false;
        audioRef.current.pause();
      } else {
        wantsPlayRef.current = true;
        // A rejection here (e.g. the cached URL expired) fires the audio
        // 'error' handler, which re-fetches the URL and retries once.
        audioRef.current.play().catch(() => {});
      }
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

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <audio ref={audioRef} />
        <Button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-8 h-8 p-0 rounded-full bg-[#39b54a] text-black hover:bg-[#2e9140] flex items-center justify-center flex-shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </Button>
        <span className="text-xs text-[#a1a1a1] w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={trackDuration || 100}
          value={currentTime}
          onChange={handleProgressChange}
          className="flex-1 h-1 bg-[#2a2a2a] rounded-full cursor-pointer"
        />
        <span className="text-xs text-[#a1a1a1] w-10">
          {formatTime(trackDuration)}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] rounded-lg p-6 border border-[#2a2a2a]">
      <audio ref={audioRef} />

      <div className="flex items-center gap-4 mb-4">
        <Button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-12 h-12 rounded-full bg-[#39b54a] text-black hover:bg-[#2e9140] flex items-center justify-center"
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
            max={trackDuration || 100}
            value={currentTime}
            onChange={handleProgressChange}
            className="flex-1 h-1 bg-[#2a2a2a] rounded-full cursor-pointer"
          />
          <span className="text-xs text-[#a1a1a1] w-10">
            {formatTime(trackDuration)}
          </span>
        </div>
      </div>

      {!hideVolume && (
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
      )}
    </div>
  );
}

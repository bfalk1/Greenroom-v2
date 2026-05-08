"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Pause, Music, X, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import {
  clearNowPlayingTrack,
  useNowPlayingTrack,
  useNowPlayingQueue,
} from "@/lib/audio/nowPlaying";
import {
  getGlobalAudio,
  getGlobalPlayingId,
  globalSetters,
  globalToggleFns,
  setGlobalPlayingId,
  toggleGlobalPlay,
} from "@/components/marketplace/SampleCard";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlayingBar() {
  const track = useNowPlayingTrack();
  const queue = useNowPlayingQueue();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const scrubBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const greenroom = (window as { greenroom?: { isDesktop?: boolean } }).greenroom;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detect desktop shell post-hydration to avoid SSR/CSR mismatch
    setIsDesktopShell(Boolean(greenroom?.isDesktop));
  }, []);

  const currentIndex = useMemo(() => {
    if (!track) return -1;
    return queue.findIndex((t) => t.id === track.id);
  }, [track, queue]);

  const prevTrack = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextTrack =
    currentIndex >= 0 && currentIndex < queue.length - 1
      ? queue[currentIndex + 1]
      : null;

  // Subscribe to audio element events for play/pause/time updates
  useEffect(() => {
    if (!track) return;
    const audio = getGlobalAudio();
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => {
      if (!isScrubbing) setCurrentTime(audio.currentTime);
    };
    const onLoaded = () => setDuration(audio.duration || 0);
    const onVolume = () => {
      setVolume(audio.volume);
      setMuted(audio.muted);
    };

    setIsPlaying(!audio.paused && !audio.ended);
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
    setVolume(audio.volume);
    setMuted(audio.muted);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("volumechange", onVolume);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("volumechange", onVolume);
    };
  }, [track, isScrubbing]);

  const handleSkip = useCallback(
    async (target: typeof prevTrack | typeof nextTrack) => {
      if (!target) return;
      // If the target row is mounted, use its toggle (handles fetch + analytics).
      if (globalToggleFns.has(target.id)) {
        await toggleGlobalPlay(target.id);
        return;
      }
      // Fallback: do nothing if the row isn't mounted (e.g., on a different page).
    },
    [prevTrack, nextTrack]
  );

  const handleTogglePlay = useCallback(async () => {
    const audio = getGlobalAudio();
    if (!audio || !track) return;
    if (audio.paused || audio.ended) {
      try {
        await audio.play();
        if (getGlobalPlayingId() !== track.id) {
          setGlobalPlayingId(track.id);
          globalSetters.get(track.id)?.(true);
        }
      } catch (err) {
        console.error("Resume play failed:", err);
      }
    } else {
      audio.pause();
      const playingId = getGlobalPlayingId();
      if (playingId) {
        globalSetters.get(playingId)?.(false);
        setGlobalPlayingId(null);
      }
    }
  }, [track]);

  const seekToClientX = useCallback((clientX: number) => {
    const audio = getGlobalAudio();
    const bar = scrubBarRef.current;
    if (!audio || !bar) return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = audio.duration * ratio;
    setCurrentTime(audio.currentTime);
  }, []);

  const handleScrubMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsScrubbing(true);
      seekToClientX(e.clientX);
    },
    [seekToClientX]
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const handleMove = (e: MouseEvent) => seekToClientX(e.clientX);
    const handleUp = () => setIsScrubbing(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isScrubbing, seekToClientX]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = getGlobalAudio();
    if (!audio) return;
    const next = parseFloat(e.target.value);
    audio.volume = next;
    if (next > 0 && audio.muted) audio.muted = false;
  };

  const handleToggleMute = () => {
    const audio = getGlobalAudio();
    if (!audio) return;
    audio.muted = !audio.muted;
  };

  const handleClose = () => {
    const audio = getGlobalAudio();
    if (audio) {
      audio.pause();
      const playingId = getGlobalPlayingId();
      if (playingId) {
        globalSetters.get(playingId)?.(false);
        setGlobalPlayingId(null);
      }
    }
    clearNowPlayingTrack();
  };

  const progressPercent = useMemo(() => {
    if (!duration) return 0;
    return Math.max(0, Math.min(100, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  if (!track) return null;

  const cover = track.coverUrl;
  const artistHref = track.artistSlug
    ? `/artist/${encodeURIComponent(track.artistSlug)}`
    : track.artistName
    ? `/artist/${encodeURIComponent(track.artistName)}`
    : null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur data-[desktop=true]:left-52"
      data-desktop={isDesktopShell || undefined}
      role="region"
      aria-label="Audio player"
    >
      <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-72">
          <div className="relative w-12 h-12 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
            {cover ? (
              <img
                src={cover}
                alt={track.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-5 h-5 text-[#39b54a]" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white" title={track.name}>
              {track.name}
            </p>
            {artistHref ? (
              <Link
                href={artistHref}
                className="truncate block text-xs text-[#39b54a] hover:text-[#2da03e] transition"
              >
                {track.artistName || "Unknown"}
              </Link>
            ) : (
              <span className="truncate block text-xs text-[#a1a1a1]">
                {track.artistName || "Unknown"}
              </span>
            )}
          </div>
        </div>

        {/* Controls + scrub */}
        <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSkip(prevTrack)}
              disabled={!prevTrack}
              aria-label="Previous track"
              title={prevTrack ? `Previous: ${prevTrack.name}` : undefined}
              className="text-[#a1a1a1] hover:text-white disabled:text-[#3a3a3a] disabled:cursor-not-allowed transition p-1"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-[#39b54a] text-black hover:bg-[#2e9140] flex items-center justify-center transition"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSkip(nextTrack)}
              disabled={!nextTrack}
              aria-label="Next track"
              title={nextTrack ? `Next: ${nextTrack.name}` : undefined}
              className="text-[#a1a1a1] hover:text-white disabled:text-[#3a3a3a] disabled:cursor-not-allowed transition p-1"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
          </div>
          <div className="w-full flex items-center gap-2 text-[10px] text-[#a1a1a1] tabular-nums">
            <span className="w-9 text-right">{formatTime(currentTime)}</span>
            <div
              ref={scrubBarRef}
              role="slider"
              aria-label="Seek position"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration) || 0}
              aria-valuenow={Math.round(currentTime)}
              tabIndex={0}
              onMouseDown={handleScrubMouseDown}
              className="group relative h-1.5 flex-1 rounded-full bg-[#2a2a2a] cursor-pointer"
            >
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-[#39b54a]"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progressPercent}%` }}
              />
            </div>
            <span className="w-9 text-left">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume + close */}
        <div className="hidden md:flex items-center gap-2 w-40">
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="text-[#a1a1a1] hover:text-white transition p-1"
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
            className="flex-1 h-1 accent-[#39b54a]"
          />
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close player"
          className="text-[#666] hover:text-white transition p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

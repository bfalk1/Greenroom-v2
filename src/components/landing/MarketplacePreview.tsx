"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Heart, Lock, Pause, Play, Search, X } from "lucide-react";
import { Waveform } from "@/components/audio/Waveform";
import { trackLandingCta } from "@/lib/analytics";

/**
 * Interactive marketplace preview for the landing page.
 *
 * Deliberately LIMITED: it loads one pool of popular samples and lets an
 * anonymous visitor search, filter by type/genre and audition tracks entirely
 * client-side — no account, no repeated API calls. The acquisition actions
 * (download, favorite) and the full catalog are locked behind the paywall, so
 * every "locked" interaction funnels to /pricing.
 */

export interface PreviewSample {
  id: string;
  name: string;
  artist_name?: string;
  creator_id: string;
  creator_avatar?: string | null;
  genre?: string;
  sample_type?: string; // "LOOP" | "ONE_SHOT"
  key?: string;
  bpm?: number;
  tags?: string[];
  preview_url?: string;
  waveform_data?: number[] | null;
}

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "LOOP", label: "Loops" },
  { key: "ONE_SHOT", label: "One-shots" },
] as const;

type TypeKey = (typeof TYPE_TABS)[number]["key"];

export function MarketplacePreview({
  samples,
  total,
}: {
  samples: PreviewSample[];
  total: number | null;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const [query, setQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [genre, setGenre] = useState<string>("all");

  // Only samples with a playable preview belong in an audition widget.
  const pool = useMemo(
    () => samples.filter((s) => s.preview_url),
    [samples]
  );

  // Genre chips are derived from the pool (most common first) — no extra fetch,
  // and they always reflect what's actually auditionable.
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of pool) {
      const g = s.genre?.trim();
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([g]) => g);
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((s) => {
      if (typeKey !== "all" && s.sample_type !== typeKey) return false;
      if (genre !== "all" && s.genre !== genre) return false;
      if (!q) return true;
      const haystack = [
        s.name,
        s.artist_name,
        s.genre,
        ...(s.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pool, query, typeKey, genre]);

  // Cap what an anonymous visitor sees — the rest is behind the paywall.
  const VISIBLE = 5;
  const visible = filtered.slice(0, VISIBLE);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingId(null);
    setProgress(0);
  }, []);

  const toggle = useCallback(
    (sample: PreviewSample) => {
      if (!sample.preview_url) return;
      if (playingId === sample.id) {
        stop();
        return;
      }
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = "none";
        audioRef.current = audio;
        audio.addEventListener("timeupdate", () => {
          if (!audio || !audio.duration) return;
          setProgress((audio.currentTime / audio.duration) * 100);
        });
        audio.addEventListener("ended", () => {
          setPlayingId(null);
          setProgress(0);
        });
      }
      audio.src = sample.preview_url;
      audio.currentTime = 0;
      setProgress(0);
      setPlayingId(sample.id);
      audio.play().catch(() => setPlayingId(null));
      trackLandingCta("preview_play");
    },
    [playingId, stop]
  );

  const seek = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = (percent / 100) * audio.duration;
    setProgress(percent);
  }, []);

  // A locked action always funnels to the paywall.
  const goJoin = useCallback(
    (reason: string) => {
      trackLandingCta(reason);
      router.push("/pricing");
    },
    [router]
  );

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, []);

  if (pool.length === 0) return null;

  const totalLabel =
    total && total > pool.length ? total.toLocaleString("en-US") : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]/80 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
      {/* Toolbar */}
      <div className="border-b border-white/8 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#a1a1a1]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#39b54a] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#39b54a]" />
            </span>
            Preview the marketplace
          </div>
          <span className="hidden text-xs text-[#666] sm:block">
            No account needed
          </span>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center rounded-xl border border-white/10 bg-black/40 px-3 focus-within:border-[#39b54a]/50">
          <Search className="h-4 w-4 shrink-0 text-[#666]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sounds, creators, tags…"
            className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-[#6f6f6f] outline-none"
            aria-label="Search the marketplace preview"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-[#666] transition hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeKey(t.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                typeKey === t.key
                  ? "bg-[#39b54a] text-black"
                  : "border border-white/10 text-[#a1a1a1] hover:border-white/25 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
          {genres.length > 0 && <span className="mx-1 h-4 w-px bg-white/10" />}
          <div className="flex flex-nowrap gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setGenre("all")}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
                genre === "all"
                  ? "border border-[#39b54a]/50 bg-[#39b54a]/10 text-[#39b54a]"
                  : "border border-white/10 text-[#a1a1a1] hover:border-white/25 hover:text-white"
              }`}
            >
              All genres
            </button>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
                  genre === g
                    ? "border border-[#39b54a]/50 bg-[#39b54a]/10 text-[#39b54a]"
                    : "border border-white/10 text-[#a1a1a1] hover:border-white/25 hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/5">
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-[#8a8a8a]">
            No sounds match that. Try another search or filter.
          </div>
        ) : (
          visible.map((sample) => {
            const isPlaying = playingId === sample.id;
            return (
              <div
                key={sample.id}
                className={`group flex items-center gap-3 px-4 py-3 transition sm:gap-4 sm:px-5 ${
                  isPlaying ? "bg-[#39b54a]/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(sample)}
                  aria-label={isPlaying ? `Pause ${sample.name}` : `Play ${sample.name}`}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                    isPlaying
                      ? "bg-[#39b54a] text-black shadow-[0_0_24px_rgba(0,255,136,0.4)]"
                      : "border border-white/15 bg-white/5 text-white group-hover:border-[#39b54a]/60 group-hover:text-[#39b54a]"
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" fill="currentColor" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                  )}
                </button>

                {sample.creator_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sample.creator_avatar}
                    alt=""
                    className="hidden h-9 w-9 shrink-0 rounded-lg object-cover sm:block"
                  />
                ) : (
                  <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-[#39b54a] sm:flex">
                    {(sample.artist_name || "G").charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1 sm:max-w-[190px]">
                  <p className="truncate text-sm font-semibold text-white">
                    {sample.name}
                  </p>
                  <p className="truncate text-xs text-[#8a8a8a]">
                    {sample.artist_name || "Greenroom creator"}
                  </p>
                </div>

                <div className="hidden min-w-0 flex-1 md:block">
                  <Waveform
                    audioUrl={sample.preview_url}
                    data={sample.waveform_data || undefined}
                    isPlaying={isPlaying}
                    progress={isPlaying ? progress : 0}
                    height={30}
                    barWidth={2}
                    barGap={1}
                    barColor={isPlaying ? "#4a4a4a" : "#333333"}
                    progressColor="#39b54a"
                    onSeek={isPlaying ? seek : undefined}
                  />
                </div>

                <div className="hidden shrink-0 items-center gap-2 lg:flex">
                  {sample.bpm ? (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#a1a1a1]">
                      {sample.bpm} BPM
                    </span>
                  ) : null}
                  {sample.key && (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#a1a1a1]">
                      {sample.key}
                    </span>
                  )}
                </div>

                {/* Locked actions — every click funnels to the paywall */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goJoin("preview_locked_favorite")}
                    title="Join to save favorites"
                    aria-label="Join to save favorites"
                    className="group/lock relative flex h-9 w-9 items-center justify-center rounded-lg text-[#666] transition hover:bg-white/5 hover:text-[#39b54a]"
                  >
                    <Heart className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goJoin("preview_locked_download")}
                    title="Join to download"
                    aria-label="Join to download"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#666] transition hover:bg-white/5 hover:text-[#39b54a]"
                  >
                    <Download className="h-4 w-4" />
                    <Lock className="absolute -right-0 -top-0 h-2.5 w-2.5 text-[#39b54a]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Locked-catalog footer */}
      <button
        type="button"
        onClick={() => goJoin("preview_unlock_catalog")}
        className="group flex w-full items-center justify-between gap-3 border-t border-white/8 bg-gradient-to-r from-[#39b54a]/[0.08] to-transparent px-5 py-4 text-left transition hover:from-[#39b54a]/[0.14]"
      >
        <span className="flex items-center gap-2.5 text-sm text-[#cfcfcf]">
          <Lock className="h-4 w-4 text-[#39b54a]" />
          {totalLabel ? (
            <>
              You&apos;re previewing a few of{" "}
              <span className="font-bold text-white">{totalLabel}</span> sounds
            </>
          ) : (
            <>Downloads and the full catalog unlock when you join</>
          )}
        </span>
        <span className="shrink-0 rounded-full bg-[#39b54a] px-4 py-2 text-xs font-bold text-black transition group-hover:shadow-[0_0_24px_rgba(0,255,136,0.45)]">
          Join to unlock
        </span>
      </button>
    </div>
  );
}

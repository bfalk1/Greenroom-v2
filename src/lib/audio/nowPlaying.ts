"use client";

import { useSyncExternalStore } from "react";

export interface NowPlayingTrack {
  id: string;
  name: string;
  artistName?: string;
  coverUrl?: string;
  artistSlug?: string;
}

let currentTrack: NowPlayingTrack | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getNowPlayingTrack(): NowPlayingTrack | null {
  return currentTrack;
}

export function setNowPlayingTrack(track: NowPlayingTrack | null): void {
  if (
    track === currentTrack ||
    (track && currentTrack && track.id === currentTrack.id)
  ) {
    return;
  }
  currentTrack = track;
  emit();
}

export function clearNowPlayingTrack(): void {
  if (currentTrack === null) return;
  currentTrack = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNowPlayingTrack(): NowPlayingTrack | null {
  return useSyncExternalStore(
    subscribe,
    getNowPlayingTrack,
    () => null
  );
}

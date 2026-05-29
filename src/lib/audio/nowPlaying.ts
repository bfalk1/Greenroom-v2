"use client";

import { useSyncExternalStore } from "react";

export interface NowPlayingTrack {
  id: string;
  name: string;
  artistName?: string;
  coverUrl?: string;
  artistSlug?: string;
}

export interface QueueNavigation {
  hasPrevPage?: boolean;
  hasNextPage?: boolean;
  onPrevPage?: () => void;
  onNextPage?: () => void;
}

let currentTrack: NowPlayingTrack | null = null;
let currentQueue: NowPlayingTrack[] = [];
let currentNavigation: QueueNavigation = {};
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

export function getNowPlayingQueue(): NowPlayingTrack[] {
  return currentQueue;
}

export function setNowPlayingQueue(queue: NowPlayingTrack[]): void {
  if (queue === currentQueue) return;
  if (
    queue.length === currentQueue.length &&
    queue.every((t, i) => t.id === currentQueue[i]?.id)
  ) {
    return;
  }
  currentQueue = queue;
  emit();
}

export function getQueueNavigation(): QueueNavigation {
  return currentNavigation;
}

export function setQueueNavigation(nav: QueueNavigation): void {
  if (
    nav === currentNavigation ||
    (nav.hasPrevPage === currentNavigation.hasPrevPage &&
      nav.hasNextPage === currentNavigation.hasNextPage &&
      nav.onPrevPage === currentNavigation.onPrevPage &&
      nav.onNextPage === currentNavigation.onNextPage)
  ) {
    return;
  }
  currentNavigation = nav;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY_QUEUE: NowPlayingTrack[] = [];

export function useNowPlayingTrack(): NowPlayingTrack | null {
  return useSyncExternalStore(
    subscribe,
    getNowPlayingTrack,
    () => null
  );
}

export function useNowPlayingQueue(): NowPlayingTrack[] {
  return useSyncExternalStore(
    subscribe,
    getNowPlayingQueue,
    () => EMPTY_QUEUE
  );
}

const EMPTY_NAVIGATION: QueueNavigation = {};

export function useQueueNavigation(): QueueNavigation {
  return useSyncExternalStore(
    subscribe,
    getQueueNavigation,
    () => EMPTY_NAVIGATION
  );
}

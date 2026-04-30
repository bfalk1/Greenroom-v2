"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUser } from "@/lib/hooks/useUser";

const PAGE_SIZE = 20;
const SYNC_BATCH_SIZE = 20;
const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

type LibrarySample = {
  id: string;
  name: string;
  artist_name: string;
};

type SampleFolderResult = {
  ok: boolean;
  sampleFolderPath?: string;
  cancelled?: boolean;
  unreachable?: boolean;
  error?: string;
};

type GreenroomDesktopApi = {
  isDesktop?: boolean;
  ensureLocalSampleFolder?: () => Promise<SampleFolderResult>;
  getLocalSampleStatus?: (
    sampleId: string,
    sampleName: string,
    artistName?: string
  ) => Promise<{ ok: boolean; status?: { isLocal?: boolean }; error?: string }>;
  syncLocalSamplesBatch?: (
    samples: Array<{ sampleId: string; sampleName: string; artistName?: string }>
  ) => Promise<{ ok: boolean; results?: Array<{ sampleId: string }>; error?: string }>;
};

async function fetchAllLibrarySamples(): Promise<LibrarySample[]> {
  const all: LibrarySample[] = [];
  let offset = 0;
  let totalCount = 0;
  do {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    const res = await fetch(`/api/library?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to fetch library");
    }
    const pageSamples: LibrarySample[] = data.samples || [];
    totalCount = typeof data.total === "number" ? data.total : pageSamples.length;
    all.push(...pageSamples);
    if (pageSamples.length === 0) break;
    offset += pageSamples.length;
  } while (all.length < totalCount);
  return all;
}

async function getMissingLocalSamples(
  greenroom: GreenroomDesktopApi,
  allSamples: LibrarySample[]
): Promise<LibrarySample[]> {
  if (!greenroom.getLocalSampleStatus) return allSamples;
  const missing: LibrarySample[] = [];
  for (let i = 0; i < allSamples.length; i += SYNC_BATCH_SIZE) {
    const batch = allSamples.slice(i, i + SYNC_BATCH_SIZE);
    const statuses = await Promise.all(
      batch.map((s) => greenroom.getLocalSampleStatus!(s.id, s.name, s.artist_name))
    );
    batch.forEach((sample, idx) => {
      const isLocal = Boolean(statuses[idx]?.ok && statuses[idx]?.status?.isLocal);
      if (!isLocal) missing.push(sample);
    });
  }
  return missing;
}

export function DesktopLibrarySync() {
  const { user } = useUser();
  const isRunningRef = useRef(false);
  const folderCancelledRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
    if (!greenroom?.isDesktop) return;
    const ensureFolder = greenroom.ensureLocalSampleFolder;
    const syncBatch = greenroom.syncLocalSamplesBatch;
    if (!ensureFolder || !syncBatch) return;

    const runSync = async (isInitial: boolean) => {
      if (isRunningRef.current) return;
      // Once the user dismisses the first-run picker, don't keep nagging on every interval.
      if (folderCancelledRef.current && !isInitial) return;
      isRunningRef.current = true;
      let toastId: string | number | undefined;
      try {
        const folderResult = await ensureFolder();
        if (folderResult?.cancelled) {
          folderCancelledRef.current = true;
          return;
        }
        if (!folderResult?.ok) {
          if (folderResult?.unreachable && isInitial) {
            toast.error(
              folderResult.error ||
                "Greenroom can't reach your sample folder. Pick a new one in Account → Greenroom App."
            );
          }
          return;
        }
        folderCancelledRef.current = false;

        const allSamples = await fetchAllLibrarySamples();
        if (allSamples.length === 0) return;

        const missing = await getMissingLocalSamples(greenroom, allSamples);
        if (missing.length === 0) {
          window.dispatchEvent(new CustomEvent("greenroom:library-sync-complete"));
          return;
        }

        toastId = toast.loading(`Syncing your library (0/${missing.length})…`);
        for (let i = 0; i < missing.length; i += SYNC_BATCH_SIZE) {
          const batch = missing.slice(i, i + SYNC_BATCH_SIZE);
          const result = await syncBatch(
            batch.map((s) => ({ sampleId: s.id, sampleName: s.name, artistName: s.artist_name }))
          );
          if (!result?.ok) {
            throw new Error(result?.error || "Library sync failed");
          }
          const completed = Math.min(i + batch.length, missing.length);
          toast.loading(`Syncing your library (${completed}/${missing.length})…`, { id: toastId });
        }
        toast.success(
          `Synced ${missing.length} sample${missing.length === 1 ? "" : "s"} to your library.`,
          { id: toastId }
        );
        window.dispatchEvent(new CustomEvent("greenroom:library-sync-complete"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Library sync failed";
        if (toastId !== undefined) {
          toast.error(message, { id: toastId });
        } else if (isInitial) {
          toast.error(message);
        }
      } finally {
        isRunningRef.current = false;
      }
    };

    void runSync(true);

    const interval = window.setInterval(() => {
      void runSync(false);
    }, RESYNC_INTERVAL_MS);

    const onFocus = () => {
      void runSync(false);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  return null;
}

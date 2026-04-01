"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type LocalSampleStatus = {
  sampleId: string;
  sampleName: string;
  isLocal: boolean;
  localPath?: string;
  syncedAt?: string;
};

type GreenroomDesktopApi = {
  isDesktop?: boolean;
  getLocalSampleStatus?: (
    sampleId: string,
    sampleName: string,
    artistName?: string
  ) => Promise<{ ok: boolean; status?: LocalSampleStatus; error?: string }>;
  syncLocalSample?: (
    sampleId: string,
    sampleName: string,
    artistName?: string
  ) => Promise<{ ok: boolean; status?: LocalSampleStatus; error?: string }>;
  startSampleDrag?: (sampleId: string, sampleName: string) => void;
  onNativeDragRecovery?: (
    callback: (payload?: { reason?: string; at?: string }) => void
  ) => () => void;
};

interface UseDesktopSampleDragOptions {
  sampleId: string;
  sampleName: string;
  artistName?: string;
  enabled: boolean;
  refreshKey?: number;
}

export function useDesktopSampleDrag({
  sampleId,
  sampleName,
  artistName,
  enabled,
  refreshKey = 0,
}: UseDesktopSampleDragOptions) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandleKey, setDragHandleKey] = useState(0);
  const syncPromiseRef = useRef<Promise<boolean> | null>(null);
  const dragResetTimeoutRef = useRef<number | null>(null);
  const debugPrefix = `[drag-hook:${sampleId.slice(0, 8)}]`;
  const resetDragState = useCallback(
    (reason: string) => {
      console.log(`${debugPrefix} resetDragState`, { reason });
      if (dragResetTimeoutRef.current) {
        window.clearTimeout(dragResetTimeoutRef.current);
        dragResetTimeoutRef.current = null;
      }
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
      setIsDragging(false);
      setDragHandleKey((prev) => prev + 1);
    },
    [debugPrefix]
  );

  useEffect(() => {
    const checkDesktop = () => {
      const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
      const desktop = Boolean(greenroom?.isDesktop);
      setIsDesktop(desktop);
      return desktop;
    };

    checkDesktop();
    const timer = window.setTimeout(checkDesktop, 500);
    return () => window.clearTimeout(timer);
  }, []);

  const refreshLocalStatus = useCallback(async () => {
    const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
    if (!enabled || !greenroom?.getLocalSampleStatus) {
      setIsLocal(false);
      return false;
    }

    const result = await greenroom.getLocalSampleStatus(sampleId, sampleName, artistName);
    const nextIsLocal = Boolean(result?.ok && result.status?.isLocal);
    setIsLocal(nextIsLocal);
    return nextIsLocal;
  }, [artistName, enabled, sampleId, sampleName]);

  useEffect(() => {
    if (!isDesktop || refreshKey === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshLocalStatus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isDesktop, refreshKey, refreshLocalStatus]);

  const syncSample = useCallback(
    (showErrorToast = false) => {
      console.log(`${debugPrefix} prepareDrag called`, {
        showErrorToast,
        enabled,
        isDesktop,
        isLocal,
        hasInFlightPrepare: Boolean(syncPromiseRef.current),
      });
      if (!enabled || !isDesktop) {
        return Promise.resolve(false);
      }

      const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
      if (!greenroom?.syncLocalSample) {
        console.warn(`${debugPrefix} missing syncLocalSample bridge`);
        if (showErrorToast) {
          toast.error("Desktop sync is unavailable right now.");
        }
        return Promise.resolve(false);
      }

      if (isLocal) {
        console.log(`${debugPrefix} syncSample short-circuit; already local`);
        return Promise.resolve(true);
      }

      if (syncPromiseRef.current) {
        console.log(`${debugPrefix} syncSample reusing in-flight promise`);
        return syncPromiseRef.current;
      }

      setIsSyncing(true);
      const startedAt = performance.now();
      const syncPromise = greenroom
        .syncLocalSample(sampleId, sampleName, artistName)
        .then((result) => {
          const ok = Boolean(result?.ok && result.status?.isLocal);
          console.log(`${debugPrefix} syncSample resolved`, {
            ok,
            elapsedMs: Math.round(performance.now() - startedAt),
            error: result?.error,
          });
          setIsLocal(ok);
          if (!ok && showErrorToast) {
            toast.error(result?.error || "Could not sync sample locally.");
          } else if (ok && showErrorToast) {
            toast.success(`"${sampleName}" synced locally.`);
          }
          return ok;
        })
        .catch((error) => {
          console.error(`${debugPrefix} syncSample threw`, error);
          if (showErrorToast) {
            toast.error(error instanceof Error ? error.message : "Could not sync sample locally.");
          }
          setIsLocal(false);
          return false;
        })
        .finally(() => {
          console.log(`${debugPrefix} syncSample finished`, {
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          syncPromiseRef.current = null;
          setIsSyncing(false);
        });

      syncPromiseRef.current = syncPromise;
      return syncPromise;
    },
    [artistName, debugPrefix, enabled, isDesktop, isLocal, sampleId, sampleName]
  );

  const handlePointerDown = useCallback((e: MouseEvent<HTMLElement>) => {
    console.log(`${debugPrefix} handlePointerDown`, {
      enabled,
      isDesktop,
      isLocal,
      isSyncing,
    });
    if (!enabled || !isDesktop) {
      return;
    }

    const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
    if (!greenroom?.startSampleDrag) {
      console.warn(`${debugPrefix} missing startSampleDrag bridge`);
      toast.error("Desktop drag is unavailable right now.");
      return;
    }

    if (!isLocal) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    if (dragResetTimeoutRef.current) {
      window.clearTimeout(dragResetTimeoutRef.current);
    }
    dragResetTimeoutRef.current = window.setTimeout(() => {
      resetDragState("native-drag-timeout");
    }, 1200);
    console.log(`${debugPrefix} invoking startSampleDrag`);
    greenroom.startSampleDrag(sampleId, sampleName);
  }, [debugPrefix, enabled, isDesktop, isLocal, isSyncing, resetDragState, sampleId, sampleName]);

  const handlePointerUp = useCallback(() => {
    console.log(`${debugPrefix} handlePointerUp`);
    resetDragState("handlePointerUp");
  }, [debugPrefix, resetDragState]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const cleanup = (reason: string) => () => resetDragState(reason);

    const handlePointerUp = cleanup("window-pointerup");
    const handleMouseUp = cleanup("window-mouseup");
    const handleDragEndEvent = cleanup("window-dragend");
    const handleDrop = cleanup("window-drop");
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resetDragState("window-escape");
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("dragend", handleDragEndEvent);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("keyup", handleEscape);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("dragend", handleDragEndEvent);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("keyup", handleEscape);
    };
  }, [isDragging, resetDragState]);

  useEffect(() => {
    return () => {
      if (dragResetTimeoutRef.current) {
        window.clearTimeout(dragResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const greenroom = (window as { greenroom?: GreenroomDesktopApi }).greenroom;
    if (!greenroom?.onNativeDragRecovery) {
      return;
    }

    return greenroom.onNativeDragRecovery((payload) => {
      if (!payload || payload.sampleId !== sampleId) {
        return;
      }

      console.log(`${debugPrefix} native drag recovery`, payload);
      resetDragState(`ipc-${payload.reason || "unknown"}`);
    });
  }, [debugPrefix, isDesktop, resetDragState, sampleId]);

  return {
    isDesktop,
    isSyncing,
    isLocal,
    isDragging,
    dragHandleKey,
    canDrag: isDesktop && isLocal && !isDragging,
    handlePointerDown,
    handlePointerUp,
    syncSample,
    refreshLocalStatus,
  };
}

"use client";

// Polls the unread-notification counts that drive the bell / inbox badges.
// No realtime in this codebase — 60s interval + refetch on tab focus + an
// explicit window event ("gr:unread-refresh") dispatched by any component
// that marks something read, so badges update immediately after local reads.

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/useUser";

export const UNREAD_REFRESH_EVENT = "gr:unread-refresh";

const POLL_MS = 60_000;

export interface UnreadCounts {
  notifications: number;
  threads: number;
  total: number;
}

const ZERO: UnreadCounts = { notifications: 0, threads: 0, total: 0 };

// Notify every mounted badge to refetch (call after marking read).
export function dispatchUnreadRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT));
  }
}

export function useUnreadCount(options?: { staff?: boolean }) {
  const staff = options?.staff ?? false;
  const { user } = useUser();
  const [counts, setCounts] = useState<UnreadCounts>(ZERO);

  const isStaff = user?.role === "MODERATOR" || user?.role === "ADMIN";
  const enabled = Boolean(user) && (!staff || isStaff);

  // Reset on logout/role-loss during render (not in an effect — the repo's
  // react-hooks/set-state-in-effect rule forbids synchronous effect setState).
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (!enabled) setCounts(ZERO);
  }

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(
        staff ? "/api/mod/inbox/unread-count" : "/api/notifications/unread-count"
      );
      if (!res.ok) return;
      const data = await res.json();
      if (staff) {
        const threads = data.threads ?? 0;
        setCounts({ notifications: 0, threads, total: threads });
      } else {
        setCounts({
          notifications: data.notifications ?? 0,
          threads: data.threads ?? 0,
          total: data.total ?? 0,
        });
      }
    } catch {
      // Badge is best-effort; keep the last known count on network errors.
    }
  }, [enabled, staff]);

  useEffect(() => {
    if (!enabled) return;
    // Initial fetch runs from a zero-delay timer so all setState happens in
    // callback position (react-hooks/set-state-in-effect).
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(UNREAD_REFRESH_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener(UNREAD_REFRESH_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { ...counts, refresh };
}

"use client";

// Navbar notification bell: green unread badge + hand-rolled dropdown panel
// showing the last 8 notifications. Counts come from useUnreadCount (60s poll);
// the panel list itself is fetched lazily on open.

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  BellOff,
  Megaphone,
  MessageSquare,
  Music,
  Sliders,
  XCircle,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";
import {
  dispatchUnreadRefresh,
  useUnreadCount,
} from "@/lib/hooks/useUnreadCount";

interface BellNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  threadId: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function TypeIcon({ type }: { type: string }) {
  const negative = type.endsWith("_REJECTED") || type.endsWith("_REMOVED");
  if (type === "APPLICATION_APPROVED") {
    return <BadgeCheck className="w-4 h-4 text-[#39b54a]" />;
  }
  if (type === "APPLICATION_DENIED") {
    return <XCircle className="w-4 h-4 text-red-400" />;
  }
  if (type.startsWith("SAMPLE_")) {
    return (
      <Music
        className={`w-4 h-4 ${negative ? "text-red-400" : "text-[#39b54a]"}`}
      />
    );
  }
  if (type.startsWith("PRESET_")) {
    return (
      <Sliders
        className={`w-4 h-4 ${negative ? "text-red-400" : "text-[#39b54a]"}`}
      />
    );
  }
  return <Megaphone className="w-4 h-4 text-[#39b54a]" />;
}

export function NotificationBell() {
  const router = useRouter();
  const { user, refreshUser } = useUser();
  const { total, threads } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellNotification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/notifications?limit=8");
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications ?? []);
      }
    } catch {
      // Panel is best-effort; leave whatever was last shown.
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Lazily (re)fetch each time the panel opens.
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const markRead = async (ids?: string[]) => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : { all: true }),
      });
    } catch {
      // Best-effort; the 60s poll will reconcile.
    }
    dispatchUnreadRefresh();
  };

  const handleRowClick = async (n: BellNotification) => {
    if (!n.readAt) {
      await markRead([n.id]);
    }
    if (n.type === "APPLICATION_APPROVED") {
      // Role was promoted server-side; refresh so creator nav unlocks.
      await refreshUser();
    }
    setOpen(false);
    if (n.type === "APPLICATION_APPROVED" || n.type === "APPLICATION_DENIED") {
      router.push("/creator/apply");
    } else {
      router.push(`/messages?n=${n.id}`);
    }
  };

  const handleMarkAllRead = async () => {
    await markRead();
    fetchList();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5 text-[#a1a1a1]" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-[#39b54a] text-black text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50">
          {threads > 0 && (
            <Link
              href="/messages?tab=conversations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-[#39b54a]/10 border-b border-[#2a2a2a] rounded-t-lg hover:bg-[#39b54a]/15 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-[#39b54a] flex-shrink-0" />
              <span className="text-sm text-white">
                {threads} conversation{threads === 1 ? "" : "s"} with new
                replies
              </span>
            </Link>
          )}

          {loadingList ? (
            <div className="p-2 space-y-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-2 py-3 animate-pulse"
                >
                  <div className="w-4 h-4 rounded-full bg-[#2a2a2a] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-[#2a2a2a] rounded w-3/4" />
                    <div className="h-2.5 bg-[#2a2a2a] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            threads === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <BellOff className="w-8 h-8 text-[#666]" />
                <p className="text-sm text-[#a1a1a1]">
                  You&apos;re all caught up
                </p>
              </div>
            )
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-[#2a2a2a]/60">
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleRowClick(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#222] transition-colors ${
                    !n.readAt ? "bg-[#39b54a]/5" : ""
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white truncate flex-1">
                        {n.title}
                      </p>
                      {!n.readAt && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#39b54a] flex-shrink-0" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-[#a1a1a1] line-clamp-1 break-words">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[11px] text-[#666] mt-0.5">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2a2a]">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-[#a1a1a1] hover:text-white transition-colors"
            >
              Mark all read
            </button>
            <Link
              href="/messages"
              onClick={() => setOpen(false)}
              className="text-xs text-[#39b54a] hover:text-[#2e9140] transition-colors"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

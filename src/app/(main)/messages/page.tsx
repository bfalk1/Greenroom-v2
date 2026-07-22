"use client";

// User-facing inbox: Notifications tab (expandable rows, unread filter,
// mark-all-read, ?n= deep-link) + Conversations tab (threads with the
// Greenroom team). Deep-links: /messages?tab=conversations, /messages?n=<id>.

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Loader2, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  NotificationRow,
  timeAgo,
  type AppNotification,
} from "@/components/notifications/NotificationRow";
import {
  useUnreadCount,
  dispatchUnreadRefresh,
} from "@/lib/hooks/useUnreadCount";
import { toast } from "sonner";

interface ThreadListItem {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  contextType: string | null;
  contextId: string | null;
  lastMessageAt: string;
  userUnread: boolean;
  createdAt: string;
  lastMessage: {
    body: string;
    senderRole: "USER" | "STAFF";
    createdAt: string;
  } | null;
}

const PAGE_SIZE = 50;

function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  // Black pill stays legible on both the inactive (#1a1a1a) and the active
  // (#39b54a) trigger backgrounds.
  return (
    <span className="ml-1.5 rounded-full bg-black text-[#39b54a] text-[10px] font-semibold px-1.5 py-0.5 leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MessagesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("n");
  const initialTab =
    searchParams.get("tab") === "conversations"
      ? "conversations"
      : "notifications";

  const [activeTab, setActiveTab] = useState(initialTab);
  const { notifications: unreadNotifications, threads: unreadThreads } =
    useUnreadCount();

  // Notifications tab state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Conversations tab state
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const deepLinkHandled = useRef(false);

  const fetchNotifications = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoadingNotifications(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (filter === "unread") params.set("filter", "unread");
        const res = await fetch(`/api/notifications?${params.toString()}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setNotifications((prev) =>
          append ? [...prev, ...(data.notifications ?? [])] : data.notifications ?? []
        );
        setTotal(data.total ?? 0);
      } catch (error) {
        console.error("Failed to load notifications:", error);
        toast.error("Failed to load notifications");
      } finally {
        setLoadingNotifications(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  const fetchThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch(`/api/messages/threads?limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setThreads(data.threads ?? []);
    } catch (error) {
      console.error("Failed to load conversations:", error);
      toast.error("Failed to load conversations");
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // ?n=<notificationId> deep-link: expand + scroll once the list is in.
  useEffect(() => {
    if (!deepLinkId || deepLinkHandled.current || loadingNotifications) return;
    if (!notifications.some((n) => n.id === deepLinkId)) return;
    deepLinkHandled.current = true;
    setExpandedId(deepLinkId);
    // Let the expanded content render before scrolling to it.
    window.setTimeout(() => {
      rowRefs.current
        .get(deepLinkId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [deepLinkId, loadingNotifications, notifications]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic: flip locally so the row restyles immediately.
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n
      )
    );
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (res.ok) dispatchUnreadRefresh();
    } catch {
      // Best-effort; the row stays visually read and the poll self-corrects.
    }
  }, []);

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      toast.success("All notifications marked read");
      dispatchUnreadRefresh();
      fetchNotifications();
    } catch (error) {
      console.error("Failed to mark all read:", error);
      toast.error("Failed to mark notifications read");
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.replace(
      value === "conversations" ? "/messages?tab=conversations" : "/messages",
      { scroll: false }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Messages</h1>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-1 mb-6">
            <TabsTrigger
              value="notifications"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <Bell className="w-4 h-4 mr-2" />
              Notifications
              <UnreadPill count={unreadNotifications} />
            </TabsTrigger>
            <TabsTrigger
              value="conversations"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversations
              <UnreadPill count={unreadThreads} />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filter === f
                        ? "bg-[#39b54a] text-black"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#a1a1a1] hover:text-white"
                    }`}
                  >
                    {f === "all" ? "All" : "Unread"}
                  </button>
                ))}
              </div>
              {unreadNotifications > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-[#a1a1a1] hover:text-white"
                >
                  Mark all read
                </button>
              )}
            </div>

            {loadingNotifications ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[#39b54a]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="w-10 h-10 text-[#3a3a3a] mx-auto mb-3" />
                <p className="text-sm text-[#a1a1a1]">
                  {filter === "unread"
                    ? "You're all caught up — no unread notifications."
                    : "No notifications yet — updates about your uploads and application will show up here."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(n.id, el);
                      else rowRefs.current.delete(n.id);
                    }}
                  >
                    <NotificationRow
                      notification={n}
                      expanded={expandedId === n.id}
                      onToggle={(id) =>
                        setExpandedId((cur) => (cur === id ? null : id))
                      }
                      onRead={markRead}
                      onThreadCreated={(threadId) =>
                        router.push(`/messages/${threadId}`)
                      }
                    />
                  </div>
                ))}

                {total > notifications.length && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        fetchNotifications(notifications.length, true)
                      }
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 border border-[#2a2a2a] rounded-md px-4 py-2 text-sm text-[#a1a1a1] hover:text-white disabled:opacity-50"
                    >
                      {loadingMore && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations">
            {loadingThreads ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-[#39b54a]" />
              </div>
            ) : threads.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="w-10 h-10 text-[#3a3a3a] mx-auto mb-3" />
                <p className="text-sm text-[#a1a1a1]">
                  No conversations yet. When the Greenroom team messages you —
                  or you ask about a decision — it&apos;ll appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {threads.map((t) => (
                  <Link
                    key={t.id}
                    href={`/messages/${t.id}`}
                    className="block bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 hover:border-[#3a3a3a] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white font-medium truncate">
                            {t.subject}
                          </span>
                          {t.status === "CLOSED" && (
                            <span className="text-[10px] border border-[#2a2a2a] rounded px-1.5 text-[#666] flex-shrink-0">
                              CLOSED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#a1a1a1] mt-0.5">
                          Greenroom Team
                        </p>
                        {t.lastMessage && (
                          <p className="text-sm text-[#a1a1a1] truncate mt-1">
                            {t.lastMessage.senderRole === "USER" ? "You: " : ""}
                            {t.lastMessage.body}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-xs text-[#666]">
                          {timeAgo(t.lastMessageAt)}
                        </span>
                        {t.userUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#39b54a]" />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#39b54a]" />
        </div>
      }
    >
      <MessagesPageInner />
    </Suspense>
  );
}

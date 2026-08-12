"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { dispatchUnreadRefresh } from "@/lib/hooks/useUnreadCount";

interface ThreadInfo {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  contextType: string | null;
  contextId: string | null;
  userId: string;
  lastMessageAt: string;
}

interface ThreadMessage {
  id: string;
  senderRole: "USER" | "STAFF";
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface StaffThreadViewProps {
  threadId: string;
  onChanged?: () => void;
  /** Passed from the inbox list row — the thread GET has no user profile. */
  user?: {
    id: string;
    email: string;
    username: string | null;
    artistName: string | null;
    avatarUrl: string | null;
  };
}

const CONTEXT_LABELS: Record<string, string> = {
  CreatorApplication: "Creator application",
  Sample: "Sample",
  Preset: "Preset",
  Broadcast: "Broadcast",
};

const POLL_MS = 30_000;

export function StaffThreadView({
  threadId,
  onChanged,
  user,
}: StaffThreadViewProps) {
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  // Track which thread we've already announced as "opened" (unread cleared).
  const announcedRef = useRef<string | null>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/threads/${threadId}?limit=50`);
      if (res.status === 403 || res.status === 404) {
        setNotFound(true);
        setThread(null);
        setMessages([]);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setNotFound(false);
      setThread(data.thread);
      setMessages(data.messages ?? []);
      // The GET clears the staff unread flag server-side — refresh badges and
      // the inbox list once per opened thread.
      if (announcedRef.current !== threadId) {
        announcedRef.current = threadId;
        dispatchUnreadRefresh();
        onChangedRef.current?.();
      }
    } catch (error) {
      console.error("Failed to load thread:", error);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  // Initial load + 30s poll (recursive timeout) while mounted.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    setLoading(true);
    setNotFound(false);
    setThread(null);
    setMessages([]);
    setReply("");

    const tick = async () => {
      await fetchThread();
      if (!cancelled) {
        timer = window.setTimeout(tick, POLL_MS);
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [fetchThread]);

  // Keep the latest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const body = reply.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/messages/threads/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send reply");
      }
      setReply("");
      await fetchThread();
      onChangedRef.current?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send reply"
      );
    } finally {
      setSending(false);
    }
  }, [reply, sending, threadId, fetchThread]);

  const handleToggleStatus = useCallback(async () => {
    if (!thread || updatingStatus) return;
    const nextStatus = thread.status === "OPEN" ? "CLOSED" : "OPEN";

    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/mod/inbox/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update thread");
      }
      toast.success(
        nextStatus === "CLOSED" ? "Conversation closed" : "Conversation reopened"
      );
      await fetchThread();
      onChangedRef.current?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update thread"
      );
    } finally {
      setUpdatingStatus(false);
    }
  }, [thread, updatingStatus, threadId, fetchThread]);

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (notFound || !thread) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex flex-col items-center justify-center min-h-[400px] text-center px-6">
        <MessageSquare className="w-10 h-10 text-[#2a2a2a] mb-3" />
        <p className="text-white font-medium mb-1">Conversation not found</p>
        <p className="text-sm text-[#a1a1a1]">
          It may have been deleted, or you may not have access to it.
        </p>
      </div>
    );
  }

  const displayName = user
    ? user.artistName || user.username || user.email
    : null;
  const contextLabel = thread.contextType
    ? CONTEXT_LABELS[thread.contextType] || thread.contextType
    : null;

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex flex-col min-h-[400px] max-h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {user && (
            <Link
              href="/admin/users"
              className="flex items-center gap-3 min-w-0 group"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-sm text-[#a1a1a1] shrink-0">
                  {(displayName || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-[#39b54a] transition">
                  {displayName}
                </p>
                <p className="text-xs text-[#666] truncate">{user.email}</p>
              </div>
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-sm text-[#a1a1a1] truncate">{thread.subject}</p>
            {contextLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a2a] text-[#a1a1a1] mt-1">
                {contextLabel}
              </span>
            )}
          </div>
        </div>
        <Button
          onClick={handleToggleStatus}
          disabled={updatingStatus}
          variant="outline"
          className="border-[#2a2a2a] text-[#a1a1a1] hover:text-white shrink-0"
        >
          {updatingStatus ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : thread.status === "OPEN" ? (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          ) : (
            <RotateCcw className="w-4 h-4 mr-2" />
          )}
          {thread.status === "OPEN" ? "Close" : "Reopen"}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((message) => {
          const isStaff = message.senderRole === "STAFF";
          return (
            <div
              key={message.id}
              className={`flex ${isStaff ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  isStaff
                    ? "bg-[#39b54a]/10 border border-[#39b54a]/30"
                    : "bg-[#0a0a0a] border border-[#2a2a2a]"
                }`}
              >
                <p
                  className={`text-xs mb-1 ${
                    isStaff ? "text-[#39b54a]" : "text-[#666]"
                  }`}
                >
                  {isStaff
                    ? message.senderName || "Greenroom Team"
                    : displayName || "User"}
                  {" · "}
                  {new Date(message.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-white whitespace-pre-wrap break-words">
                  {message.body}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[#2a2a2a] p-3">
        {thread.status === "CLOSED" && (
          <p className="text-xs text-[#666] mb-2">
            This conversation is closed — replying will reopen it.
          </p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={5000}
            rows={2}
            placeholder="Reply as Greenroom Team..."
            className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-y"
          />
          <Button
            onClick={handleSend}
            disabled={sending || !reply.trim()}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140] shrink-0"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

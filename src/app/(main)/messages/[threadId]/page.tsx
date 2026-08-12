"use client";

// Single conversation view. Staff messages always render as "Greenroom Team"
// (individual staff identity is never shown to users — the DB keeps senderId
// for accountability, but senderName is only meaningful in the staff inbox).
// Bodies are plain text rendered as React text nodes; no HTML, no autolinking.

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, MessageSquare, Send, Shield } from "lucide-react";
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

const CONTEXT_LABELS: Record<string, string> = {
  CreatorApplication: "Creator application",
  Sample: "Sample",
  Preset: "Preset",
  Broadcast: "Announcement",
};

const POLL_MS = 30_000;
const MAX_BODY_LENGTH = 5000;
const COUNTER_THRESHOLD = 4500;

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params?.threadId;

  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCount = useRef(0);

  const fetchThread = useCallback(async (): Promise<"ok" | "gone" | "error"> => {
    if (!threadId) return "gone";
    try {
      const res = await fetch(`/api/messages/threads/${threadId}`);
      if (res.status === 403 || res.status === 404) {
        setNotFound(true);
        return "gone";
      }
      if (!res.ok) return "error";
      const data = await res.json();
      setThread(data.thread ?? null);
      setMessages(data.messages ?? []);
      // The GET clears this viewer's unread flag server-side — sync badges.
      dispatchUnreadRefresh();
      return "ok";
    } catch {
      return "error";
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  // Initial load + 30s poll. Recursive timeout (not setInterval) so a slow
  // response can't stack overlapping requests; stops on 403/404 and unmount.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const result = await fetchThread();
      if (!cancelled && result !== "gone") {
        timer = window.setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [fetchThread]);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    if (messages.length > 0 && messages.length !== lastMessageCount.current) {
      lastMessageCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  const trimmed = body.trim();

  const handleSend = async () => {
    if (!trimmed || sending || !threadId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/threads/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBody("");
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        // Refetch for authoritative state (e.g. CLOSED → reopened).
        fetchThread();
      } else if (res.status === 429) {
        toast.error("You're sending messages too quickly — try again in a minute");
      } else {
        toast.error(data.error || "Failed to send message");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <MessageSquare className="w-10 h-10 text-[#3a3a3a] mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">
            Conversation not found
          </h1>
          <p className="text-sm text-[#a1a1a1] mb-6">
            This conversation doesn&apos;t exist or you don&apos;t have access
            to it.
          </p>
          <Link
            href="/messages?tab=conversations"
            className="inline-flex items-center gap-1.5 text-sm text-[#39b54a] hover:text-[#2e9140]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to messages
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !thread) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#39b54a]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 min-w-0">
          <Link
            href="/messages?tab=conversations"
            className="text-[#a1a1a1] hover:text-white flex-shrink-0"
            title="Back to messages"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-white truncate">
            {thread.subject}
          </h1>
          {thread.contextType && (
            <span className="text-xs bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-[#a1a1a1] flex-shrink-0">
              {CONTEXT_LABELS[thread.contextType] ?? thread.contextType}
            </span>
          )}
          {thread.status === "CLOSED" && (
            <span className="text-[10px] border border-[#2a2a2a] rounded px-1.5 text-[#666] flex-shrink-0">
              CLOSED
            </span>
          )}
        </div>

        {/* Messages (ascending) */}
        <div className="space-y-3 mb-6">
          {messages.map((m) =>
            m.senderRole === "USER" ? (
              <div
                key={m.id}
                className="ml-auto max-w-[80%] bg-[#39b54a]/10 border border-[#39b54a]/30 rounded-lg p-3"
              >
                <p className="text-sm text-white whitespace-pre-wrap break-words">
                  {m.body}
                </p>
                <p className="text-[10px] text-[#666] mt-1.5 text-right">
                  {formatTimestamp(m.createdAt)}
                </p>
              </div>
            ) : (
              <div
                key={m.id}
                className="max-w-[80%] bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#39b54a]" />
                  <span className="text-xs text-[#a1a1a1]">Greenroom Team</span>
                </div>
                <p className="text-sm text-white whitespace-pre-wrap break-words">
                  {m.body}
                </p>
                <p className="text-[10px] text-[#666] mt-1.5">
                  {formatTimestamp(m.createdAt)}
                </p>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        {thread.status === "CLOSED" && (
          <p className="text-xs text-[#a1a1a1] mb-2">
            This conversation was closed — replying will reopen it.
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              maxLength={MAX_BODY_LENGTH}
              placeholder="Write a reply…"
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg w-full min-h-28 p-3 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-y"
            />
            {body.length > COUNTER_THRESHOLD && (
              <p className="text-xs text-[#666] mt-1">
                {body.length}/{MAX_BODY_LENGTH}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!trimmed || sending}
            className="inline-flex items-center gap-2 bg-[#39b54a] text-black hover:bg-[#2e9140] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none flex-shrink-0 mb-1"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

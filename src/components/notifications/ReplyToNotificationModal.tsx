"use client";

// "Ask about this" modal — creates a scoped message thread from a
// notification via POST /api/messages/threads. Users can't free-initiate
// threads in v1, so this is their only entry point into messaging.

import React, { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface ReplyToNotificationModalProps {
  notification: { id: string; title: string };
  open: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

const MAX_BODY_LENGTH = 5000;
const COUNTER_THRESHOLD = 4500;

export function ReplyToNotificationModal({
  notification,
  open,
  onClose,
  onCreated,
}: ReplyToNotificationModalProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Start each open with a clean slate (state-adjustment-during-render
  // pattern — avoids a cascading-render effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setBody("");
      setSending(false);
    }
  }

  if (!open) return null;

  const trimmed = body.trim();

  const handleSend = async () => {
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id, body: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.thread?.id) {
        toast.success("Message sent — the team will reply here");
        onCreated(data.thread.id);
      } else if (res.status === 429) {
        toast.error("You're sending messages too quickly — try again in a minute");
        setSending(false);
      } else {
        toast.error(data.error || "Failed to send message");
        setSending(false);
      }
    } catch {
      toast.error("Failed to send message");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-3">
          Message the Greenroom team
        </h2>

        {/* Context chip: quotes the notification this thread is about */}
        <div className="mb-4">
          <span className="inline-block text-xs bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-[#a1a1a1] max-w-full truncate align-bottom">
            Re: {notification.title}
          </span>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          autoFocus
          maxLength={MAX_BODY_LENGTH}
          placeholder="What would you like to ask?"
          className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg w-full min-h-28 p-3 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-y"
        />
        <div className="flex items-center justify-between mt-1 min-h-4">
          {body.length > COUNTER_THRESHOLD ? (
            <span className="text-xs text-[#666]">
              {body.length}/{MAX_BODY_LENGTH}
            </span>
          ) : (
            <span />
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-sm text-[#a1a1a1] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!trimmed || sending}
            className="inline-flex items-center gap-2 bg-[#39b54a] text-black hover:bg-[#2e9140] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
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

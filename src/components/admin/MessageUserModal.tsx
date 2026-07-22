"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Search, Send, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SearchResultUser {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  role: string;
}

interface MessageUserModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: (threadId: string) => void;
  /** When provided, the recipient is fixed (contextual entry points). */
  defaultUser?: { id: string; label: string };
  contextType?: string;
  contextId?: string;
  defaultSubject?: string;
}

export function MessageUserModal({
  open,
  onClose,
  onSent,
  defaultUser,
  contextType,
  contextId,
  defaultSubject,
}: MessageUserModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(
    null
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Reset everything whenever the modal opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearching(false);
      setPicked(defaultUser ?? null);
      setSubject(defaultSubject ?? "");
      setBody("");
      setSending(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced recipient search (only in search mode, nothing picked yet).
  useEffect(() => {
    if (!open || defaultUser || picked) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/mod/users/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.users ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open, defaultUser, picked]);

  const handleSend = useCallback(async () => {
    if (!picked) {
      setError("Pick a recipient first");
      return;
    }
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject) {
      setError("Subject is required");
      return;
    }
    if (!trimmedBody) {
      setError("Message body is required");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mod/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: picked.id,
          subject: trimmedSubject,
          body: trimmedBody,
          ...(contextType ? { contextType } : {}),
          ...(contextId ? { contextId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send message");
      }
      toast.success("Message sent");
      onSent?.(data.thread.id);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [picked, subject, body, contextType, contextId, onSent, onClose]);

  if (!open) return null;

  const displayName = (u: SearchResultUser) =>
    u.artistName || u.username || u.email;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-[#39b54a]" />
            Message a user
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#a1a1a1] hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recipient */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            To
          </label>
          {picked ? (
            <span className="inline-flex items-center gap-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white">
              {picked.label}
              {!defaultUser && (
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="text-[#a1a1a1] hover:text-white transition"
                  aria-label="Clear recipient"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#666]" />
                {searching && (
                  <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-[#666] animate-spin" />
                )}
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by email, username, or artist name..."
                  autoFocus
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
                />
              </div>
              {results.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a]">
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setPicked({ id: u.id, label: displayName(u) });
                        setResults([]);
                        setQuery("");
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#242424] transition"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-white truncate">
                          {displayName(u)}
                        </span>
                        <span className="block text-xs text-[#666] truncate">
                          {u.email}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a2a] text-[#a1a1a1] shrink-0">
                        <Shield className="w-3 h-3" />
                        {u.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim().length >= 2 &&
                !searching &&
                results.length === 0 && (
                  <p className="mt-2 text-xs text-[#666]">No users found.</p>
                )}
            </div>
          )}
        </div>

        {/* Subject */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Subject..."
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
          />
        </div>

        {/* Body */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Write your message..."
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-y"
          />
          {body.length > 4500 && (
            <p className="text-xs text-[#666] text-right mt-1">
              {body.length}/5000
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-[#2a2a2a]"
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !picked || !subject.trim() || !body.trim()}
            className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  Search,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MAX_SPECIFIC_RECIPIENTS,
  audienceLabel,
  type BroadcastAudience,
} from "@/lib/broadcastAudience";

interface BroadcastComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

interface PickedUser {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  role: string;
}

const AUDIENCE_OPTIONS: {
  value: BroadcastAudience;
  label: string;
  hint: string;
}[] = [
  { value: "ALL", label: "Everyone", hint: "Every active account" },
  { value: "CREATORS", label: "Creators", hint: "Approved creators only" },
  { value: "USERS", label: "Members", hint: "Non-creator accounts" },
  { value: "SPECIFIC", label: "Specific people", hint: "Pick recipients" },
];

function displayName(u: PickedUser) {
  return u.artistName || u.username || u.email;
}

export function BroadcastComposeModal({
  open,
  onClose,
  onSent,
}: BroadcastComposeModalProps) {
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [audience, setAudience] = useState<BroadcastAudience>("CREATORS");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Recipient picker (SPECIFIC only)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedUser[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("compose");
    setAudience("CREATORS");
    setSubject("");
    setBody("");
    setSending(false);
    setCounts(null);
    setQuery("");
    setResults([]);
    setPicked([]);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/broadcasts/audience");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCounts(data.counts ?? null);
      } catch {
        // Selector just shows no counts if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced recipient search, reusing the staff messaging picker endpoint.
  useEffect(() => {
    if (!open || audience !== "SPECIFIC") return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/mod/users/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        if (!cancelled) setResults(res.ok ? data.users ?? [] : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, audience, open]);

  const recipientCount = useMemo(() => {
    if (audience === "SPECIFIC") return picked.length;
    return counts?.[audience] ?? null;
  }, [audience, counts, picked.length]);

  const togglePick = (u: PickedUser) => {
    setPicked((prev) => {
      if (prev.some((p) => p.id === u.id)) {
        return prev.filter((p) => p.id !== u.id);
      }
      if (prev.length >= MAX_SPECIFIC_RECIPIENTS) {
        toast.error(`Max ${MAX_SPECIFIC_RECIPIENTS} recipients`);
        return prev;
      }
      return [...prev, u];
    });
  };

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          audience,
          ...(audience === "SPECIFIC"
            ? { userIds: picked.map((p) => p.id) }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send broadcast");
        return;
      }
      toast.success(
        `Sent to ${data.delivered} recipient${data.delivered === 1 ? "" : "s"} (${data.emailed} emails)`
      );
      if (data.emailErrors > 0) {
        toast.warning(`${data.emailErrors} emails failed`);
      }
      onSent?.();
      onClose();
    } catch {
      toast.error("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  }, [subject, body, audience, picked, onSent, onClose]);

  if (!open) return null;

  const audienceReady = audience !== "SPECIFIC" || picked.length > 0;
  const canPreview =
    subject.trim().length > 0 && body.trim().length > 0 && audienceReady;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#39b54a]" />
            {step === "compose" ? "New notification" : "Review notification"}
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

        {step === "compose" ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Audience
              </label>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCE_OPTIONS.map((opt) => {
                  const active = audience === opt.value;
                  const n =
                    opt.value === "SPECIFIC" ? picked.length : counts?.[opt.value];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAudience(opt.value)}
                      className={`rounded-lg border p-3 text-left transition ${
                        active
                          ? "border-[#39b54a] bg-[#39b54a]/10"
                          : "border-[#2a2a2a] bg-[#0a0a0a] hover:border-[#3a3a3a]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">
                          {opt.label}
                        </span>
                        <span
                          className={`text-xs tabular-nums ${
                            active ? "text-[#39b54a]" : "text-[#666]"
                          }`}
                        >
                          {n ?? "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#666]">{opt.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {audience === "SPECIFIC" && (
              <div className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3">
                {picked.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {picked.map((u) => (
                      <span
                        key={u.id}
                        className="flex items-center gap-1 rounded-full bg-[#39b54a]/15 px-2 py-0.5 text-xs text-[#39b54a]"
                      >
                        {displayName(u)}
                        <button
                          type="button"
                          onClick={() => togglePick(u)}
                          className="hover:text-white"
                          aria-label={`Remove ${displayName(u)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by email, username, or artist name..."
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#141414] py-2 pl-9 pr-3 text-sm text-white placeholder-[#666] focus:border-[#39b54a] focus:outline-none"
                  />
                </div>

                {searching && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-[#666]">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </p>
                )}

                {!searching && results.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto">
                    {results.map((u) => {
                      const isPicked = picked.some((p) => p.id === u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => togglePick(u)}
                            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                              isPicked
                                ? "bg-[#39b54a]/10 text-[#39b54a]"
                                : "text-white hover:bg-[#1c1c1c]"
                            }`}
                          >
                            <span className="min-w-0 truncate">
                              {displayName(u)}
                              <span className="ml-2 text-xs text-[#666]">
                                {u.email}
                              </span>
                            </span>
                            <span className="shrink-0 text-[10px] uppercase text-[#666]">
                              {u.role}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-2 text-xs text-[#666]">No matches.</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 mb-4">
              <Users className="w-4 h-4 text-[#39b54a] shrink-0" />
              <p className="text-sm text-[#a1a1a1]">
                {recipientCount === null
                  ? "Loading audience..."
                  : `Will be delivered to ${audienceLabel(audience, recipientCount)}`}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Announcement subject..."
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={10000}
                rows={8}
                placeholder="Write your announcement..."
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-y"
              />
              <p className="text-xs text-[#666] text-right mt-1">
                {body.length}/10000
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 border-[#2a2a2a]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!canPreview}
                className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                Preview
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Preview rendered like a recipient's notification */}
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#39b54a]/10 rounded-lg shrink-0">
                  <Megaphone className="w-4 h-4 text-[#39b54a]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white break-words">
                    {subject.trim()}
                  </p>
                  <p className="text-sm text-[#a1a1a1] mt-1 whitespace-pre-wrap break-words">
                    {body.trim()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 mb-4">
              <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-400">
                This cannot be unsent. Going to{" "}
                {audienceLabel(audience, recipientCount ?? 0)} — each gets an
                in-app notification and an email.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep("compose")}
                variant="ghost"
                className="flex-1 text-[#a1a1a1] hover:text-white"
                disabled={sending}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Megaphone className="w-4 h-4 mr-2" />
                )}
                Send to {recipientCount ?? 0}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

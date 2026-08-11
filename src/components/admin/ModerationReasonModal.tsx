"use client";

// Collects the moderator's reason before a reject/takedown goes through. The
// reason reaches the creator as the notification body and the alert email, so
// this is the only place it can be entered — the routes reject a reason-less
// rejection outright.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { REVIEW_NOTE_MAX } from "@/lib/notificationFormat";

// Canned reasons cover the common cases so moderators aren't retyping them;
// each one is editable after it's picked.
const PRESETS = [
  "Audio quality — noise, clipping, or artifacts.",
  "Mislabeled — the BPM, key, genre, or type doesn't match the audio.",
  "Not original — contains uncleared or third-party material.",
  "Incomplete — missing preview, artwork, or required metadata.",
  "Duplicate of something already in your catalog.",
];

export function ModerationReasonModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Reject",
  required = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description?: string;
  confirmLabel?: string;
  required?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Clear between openings so a reason never leaks onto the next decision.
  useEffect(() => {
    if (open) {
      setReason("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = reason.trim();
  const tooLong = trimmed.length > REVIEW_NOTE_MAX;
  const canSubmit = !busy && !tooLong && (!required || trimmed.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#141414] p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[#a1a1a1]">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[#a1a1a1] transition-colors hover:text-white disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              disabled={busy}
              className="rounded-full border border-[#2a2a2a] bg-[#1c1c1c] px-3 py-1 text-xs text-[#a1a1a1] transition-colors hover:border-[#39b54a]/50 hover:text-white disabled:opacity-50"
            >
              {p.split(" — ")[0]}
            </button>
          ))}
        </div>

        <label
          htmlFor="moderation-reason"
          className="mb-1.5 block text-sm font-medium text-white"
        >
          Reason {required ? "" : <span className="text-[#666]">(optional)</span>}
        </label>
        <textarea
          id="moderation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          autoFocus
          disabled={busy}
          placeholder="Tell the creator what to fix. They'll see this word for word."
          className="w-full resize-none rounded-lg border border-[#2a2a2a] bg-[#1c1c1c] p-3 text-sm text-white placeholder:text-[#555] focus:border-[#39b54a] focus:outline-none disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-[#666]">
            Sent to the creator as a notification and an email.
          </span>
          <span className={tooLong ? "text-red-400" : "text-[#666]"}>
            {trimmed.length}/{REVIEW_NOTE_MAX}
          </span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            className="text-[#a1a1a1] hover:bg-[#2a2a2a] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Floating bulk-action bar for the moderation queue.
//
// Deliberately `fixed` to the bottom rather than `sticky` at the top: the old
// sticky bar sat inside the page container, so it slid under the app navbar on
// scroll and reflowed the list every time a selection started. Fixed + overlay
// means selecting a row never moves the rows underneath the cursor.

import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Pencil, Trash2, X } from "lucide-react";

export function BulkActionBar({
  count,
  busy,
  onEdit,
  onApprove,
  onReject,
  onDelete,
  onClear,
  noun = "sample",
}: {
  count: number;
  busy?: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onClear: () => void;
  noun?: string;
}) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-5 sm:pb-6">
      <div className="animate-in fade-in slide-in-from-bottom-4 pointer-events-auto mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#2a2a2a] bg-[#141414]/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl duration-200">
        <div className="flex items-center gap-2 px-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#39b54a] px-1.5 text-xs font-bold text-black tabular-nums">
            {count}
          </span>
          <span className="hidden text-sm text-[#a1a1a1] sm:inline">
            {noun}
            {count === 1 ? "" : "s"} selected
          </span>
        </div>

        <div className="h-6 w-px bg-[#2a2a2a]" aria-hidden />

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Button
            size="sm"
            onClick={onEdit}
            disabled={busy}
            className="h-8 bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busy}
            className="h-8 bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={busy}
            className="h-8 border-yellow-500/30 bg-transparent text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={busy}
            className="h-8 border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        <div className="h-6 w-px bg-[#2a2a2a]" aria-hidden />

        <div className="flex w-8 items-center justify-center">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#39b54a]" />
          ) : (
            <button
              onClick={onClear}
              className="rounded-lg p-1.5 text-[#a1a1a1] transition-colors hover:bg-[#2a2a2a] hover:text-white"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

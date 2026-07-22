"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BroadcastComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export function BroadcastComposeModal({
  open,
  onClose,
  onSent,
}: BroadcastComposeModalProps) {
  const [step, setStep] = useState<"compose" | "review">("compose");
  const [audience, setAudience] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Reset + fetch audience count whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("compose");
    setSubject("");
    setBody("");
    setSending(false);
    setAudience(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/broadcasts/audience");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAudience(data.count ?? 0);
      } catch {
        // Banner just stays generic if the count fails to load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send broadcast");
        return;
      }
      toast.success(
        `Broadcast sent to ${data.delivered} creators (${data.emailed} emails)`
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
  }, [subject, body, onSent, onClose]);

  if (!open) return null;

  const canPreview = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#39b54a]" />
            {step === "compose" ? "New broadcast" : "Review broadcast"}
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
            <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 mb-4">
              <Users className="w-4 h-4 text-[#39b54a] shrink-0" />
              <p className="text-sm text-[#a1a1a1]">
                {audience === null
                  ? "Loading audience..."
                  : `Will be delivered to ${audience} approved creator${
                      audience === 1 ? "" : "s"
                    }`}
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
            {/* Preview rendered like a creator notification */}
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
                This cannot be unsent. Every approved creator gets an in-app
                message and an email.
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
                Send to {audience ?? 0} creators
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

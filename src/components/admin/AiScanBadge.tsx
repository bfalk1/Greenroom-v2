"use client";

import { Bot } from "lucide-react";

export interface AiScanSummary {
  status: string;
  verdict: string | null;
  aiProbability: number | null;
  likelySource: string | null;
  flagged: boolean;
}

/**
 * Advisory AI-detection badge for moderation queues. Renders ONLY when a scan
 * flagged the clip — a completed scan that didn't flag renders nothing, by
 * design: the detector's "human"/no-flag outcome is not a human guarantee and
 * must never look like a verification badge.
 */
export function AiScanBadge({ scan }: { scan?: AiScanSummary | null }) {
  if (!scan?.flagged) return null;
  const prob = scan.aiProbability != null ? `${Math.round(scan.aiProbability)}%` : "";
  const source =
    scan.likelySource && scan.likelySource !== "Unknown AI" ? ` · ${scan.likelySource}` : "";
  return (
    <span
      className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap"
      title="ACRCloud AI-music detection — advisory signal, not proof. Listen before acting."
    >
      <Bot className="w-3 h-3 inline mr-1" />
      AI {prob}
      {source}
    </span>
  );
}

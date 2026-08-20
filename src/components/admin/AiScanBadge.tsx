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

/**
 * Mod-facing status line for review surfaces: reports every scan state, so a
 * reviewer knows whether the AI check ran and what it said. Deliberately
 * phrased as "not flagged" (with the raw likelihood) rather than "human" or
 * "cleared" — the detector's misses are unmeasured beyond a small calibration
 * set, so a clean result must inform the human decision, not replace it.
 */
export function AiScanStatusLine({ scan }: { scan?: AiScanSummary | null }) {
  if (scan === undefined || scan === null) {
    return <p className="text-[#666] text-sm">Not queued (pre-rollout upload)</p>;
  }
  if (scan.status === "PENDING" || scan.status === "SUBMITTED") {
    return <p className="text-yellow-500 text-sm">Scan in progress… (checks run every few minutes)</p>;
  }
  if (scan.status === "UNSCANNABLE") {
    return <p className="text-[#666] text-sm">Too short to scan reliably (&lt;3s)</p>;
  }
  if (scan.status === "ERROR") {
    return <p className="text-yellow-500 text-sm">Scan failed — treat as unscanned</p>;
  }
  const prob = scan.aiProbability != null ? `${Math.round(scan.aiProbability)}%` : "?";
  if (scan.flagged) {
    const source =
      scan.likelySource && scan.likelySource !== "Unknown AI" ? ` · likely ${scan.likelySource}` : "";
    return (
      <p className="text-red-400 text-sm font-medium">
        Flagged: {prob} AI-likelihood{source} — listen before deciding
      </p>
    );
  }
  return (
    <p className="text-[#a1a1a1] text-sm" title="Advisory only — not a human guarantee">
      Not flagged · {prob} AI-likelihood
    </p>
  );
}

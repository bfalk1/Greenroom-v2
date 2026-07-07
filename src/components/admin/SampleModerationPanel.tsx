"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import { formatSampleType } from "@/lib/utils/sampleType";

interface SampleModerationPanelProps {
  sample: {
    id: string;
    name: string;
    creator_id: string;
    genre: string;
    instrument_type: string;
    sample_type: string;
    key: string;
    bpm?: number;
    credit_price: number;
    status: string;
    file_url?: string;
    tags?: string[];
    preview_ready?: boolean;
  };
  creator?: { full_name: string };
  onModerate: (action: "approve" | "reject") => void;
  actions?: React.ReactNode;
  // Eagerly fetch the audio on mount; disable for long lists (each preload
  // mints a signed URL and downloads the full file) — playback lazy-loads.
  preloadAudio?: boolean;
}

export function SampleModerationPanel({
  sample,
  creator,
  onModerate,
  actions,
  preloadAudio = true,
}: SampleModerationPanelProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      onModerate("approve");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (
      !confirm(
        "Reject this sample? It will be sent back to draft and won't appear in the marketplace."
      )
    )
      return;

    setSubmitting(true);
    try {
      onModerate("reject");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-6">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-white">
                {sample.name}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#39b54a]/15 text-[#39b54a] border border-[#39b54a]/30 whitespace-nowrap">
                {formatSampleType(sample.sample_type)}
              </span>
            </div>
            <p className="text-[#a1a1a1] text-sm">
              by {creator?.full_name || "Unknown"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {actions}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Genre</p>
            <p className="text-white font-medium">{sample.genre}</p>
          </div>
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Instrument</p>
            <p className="text-white font-medium">{sample.instrument_type}</p>
          </div>
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Key</p>
            <p className="text-white font-medium">{sample.key}</p>
          </div>
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Price</p>
            <p className="text-white font-medium">
              {sample.credit_price} credits
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs text-[#a1a1a1] mb-2">Preview</p>
          {sample.preview_ready === false ? (
            <div className="flex items-center gap-2 py-3 px-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-yellow-500 text-sm">Preview generating... (usually 1-2 min)</span>
            </div>
          ) : (
            <AudioPlayer sampleId={sample.id} fileUrl={sample.file_url} useFullAudio preload={preloadAudio} hideVolume />
          )}
        </div>

        {sample.tags && sample.tags.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-[#a1a1a1] mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {sample.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded-full text-xs bg-[#2a2a2a] text-[#a1a1a1]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleApprove}
          disabled={submitting || sample.status === "PUBLISHED" || sample.preview_ready === false}
          className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50"
          title={sample.preview_ready === false ? "Wait for preview to generate" : undefined}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {sample.preview_ready === false ? "Waiting for Preview..." : "Approve"}
        </Button>
        <Button
          onClick={handleReject}
          disabled={submitting}
          className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Reject
        </Button>
      </div>
    </div>
  );
}

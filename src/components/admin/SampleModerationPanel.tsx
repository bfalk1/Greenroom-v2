"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { AudioPlayer } from "@/components/audio/AudioPlayer";

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
  };
  creator?: { full_name: string };
  onModerate: () => void;
}

export function SampleModerationPanel({
  sample,
  creator,
  onModerate,
}: SampleModerationPanelProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onModerate();
    } catch {
      alert("Failed to approve sample");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove this sample from marketplace?")) return;

    setSubmitting(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onModerate();
    } catch {
      alert("Failed to remove sample");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-6">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              {sample.name}
            </h3>
            <p className="text-[#a1a1a1] text-sm">
              by {creator?.full_name || "Unknown"}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#2a2a2a] text-[#a1a1a1]">
            {sample.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Genre</p>
            <p className="text-white font-medium">{sample.genre}</p>
          </div>
          <div>
            <p className="text-xs text-[#a1a1a1] mb-1">Type</p>
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
          <AudioPlayer sampleId={sample.id} fileUrl={sample.file_url} useFullAudio />
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
          disabled={submitting || sample.status === "published"}
          className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a]"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Approve
        </Button>
        <Button
          onClick={handleRemove}
          disabled={submitting}
          className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Remove
        </Button>
      </div>
    </div>
  );
}

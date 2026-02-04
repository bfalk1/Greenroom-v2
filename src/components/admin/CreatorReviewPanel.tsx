"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface Application {
  id: string;
  user_id: string;
  artist_name: string;
  bio: string;
  soundcloud_url?: string;
  spotify_url?: string;
  instagram_url?: string;
  zip_file_url: string;
  status: string;
}

interface CreatorReviewPanelProps {
  application: Application;
  onReview: () => void;
}

export function CreatorReviewPanel({
  application,
  onReview,
}: CreatorReviewPanelProps) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onReview();
    } catch {
      alert("Failed to approve application");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!reviewNotes.trim()) {
      alert("Please provide a reason for rejection");
      return;
    }

    setSubmitting(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onReview();
    } catch {
      alert("Failed to reject application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white mb-2">
          {application.artist_name}
        </h3>
        <p className="text-[#a1a1a1] text-sm mb-4">{application.bio}</p>

        <div className="space-y-2 mb-6">
          {application.soundcloud_url && (
            <a
              href={application.soundcloud_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#00FF88] hover:text-[#00cc6a] text-sm"
            >
              SoundCloud <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {application.spotify_url && (
            <a
              href={application.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#00FF88] hover:text-[#00cc6a] text-sm"
            >
              Spotify <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {application.instagram_url && (
            <a
              href={application.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#00FF88] hover:text-[#00cc6a] text-sm"
            >
              Instagram <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        <a
          href={application.zip_file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00FF88] hover:text-[#00cc6a] text-sm underline"
        >
          Download sample pack →
        </a>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-white mb-2">
          Review Notes
        </label>
        <textarea
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          placeholder="Enter approval message or rejection reason..."
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#00FF88]"
          rows={4}
        />
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleApprove}
          disabled={submitting}
          className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a]"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Approve
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

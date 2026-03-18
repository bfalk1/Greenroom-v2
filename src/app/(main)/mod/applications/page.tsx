"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  Download,
  XCircle,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ApplicationUser {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
}

interface Application {
  id: string;
  userId: string;
  artistName: string;
  bio: string | null;
  socialLinks: {
    soundcloud?: string;
    spotify?: string;
    instagram?: string;
  } | null;
  sampleZipUrl: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: ApplicationUser;
  reviewer: { id: string; username: string | null } | null;
}

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "DENIED";

export default function ModApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchApplications = useCallback(async () => {
    try {
      const params = filter !== "ALL" ? `?status=${filter}` : "";
      const res = await fetch(`/api/mod/applications${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch applications");
      }
      const data = await res.json();
      setApplications(data.applications);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchApplications();
  }, [fetchApplications]);

  const handleReview = async (
    appId: string,
    decision: "approve" | "deny"
  ) => {
    const note = reviewNotes[appId] || "";

    if (decision === "deny" && !note.trim()) {
      toast.error("Please provide a reason for denial");
      return;
    }

    setReviewingId(appId);
    try {
      const res = await fetch(`/api/mod/applications/${appId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to review application");
      }

      toast.success(
        decision === "approve"
          ? "Application approved! User is now a Creator."
          : "Application denied."
      );

      // Refresh the list
      await fetchApplications();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to review application"
      );
    } finally {
      setReviewingId(null);
    }
  };

  const handleDownload = async (appId: string) => {
    try {
      const res = await fetch(`/api/mod/applications/${appId}/download`);
      if (!res.ok) {
        throw new Error("Failed to get download URL");
      }
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (error) {
      console.error(error);
      toast.error("Failed to download file");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#39b54a]/20 text-[#39b54a] border border-[#39b54a]/30">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case "DENIED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
            <XCircle className="w-3 h-3" />
            Denied
          </span>
        );
      default:
        return null;
    }
  };

  const filterTabs: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "ALL" },
    { label: "Pending", value: "PENDING" },
    { label: "Approved", value: "APPROVED" },
    { label: "Denied", value: "DENIED" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Creator Applications
          </h1>
          <p className="text-[#a1a1a1]">
            Review and approve creator applications
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6">
          <Filter className="w-4 h-4 text-[#a1a1a1]" />
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filter === tab.value
                  ? "bg-[#39b54a] text-black"
                  : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#2a2a2a]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
          </div>
        ) : applications.length > 0 ? (
          <div className="space-y-6">
            {applications.map((app) => (
              <div
                key={app.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {app.artistName}
                    </h3>
                    <p className="text-sm text-[#a1a1a1]">
                      {app.user.email}
                      {app.user.username && ` (@${app.user.username})`}
                    </p>
                    <p className="text-xs text-[#666] mt-1">
                      Applied{" "}
                      {new Date(app.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  {statusBadge(app.status)}
                </div>

                {/* Bio */}
                {app.bio && (
                  <p className="text-[#a1a1a1] text-sm mb-4">{app.bio}</p>
                )}

                {/* Social Links */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {app.socialLinks?.soundcloud && (
                    <a
                      href={app.socialLinks.soundcloud}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#39b54a] hover:text-[#2e9140] text-sm"
                    >
                      SoundCloud <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {app.socialLinks?.spotify && (
                    <a
                      href={app.socialLinks.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#39b54a] hover:text-[#2e9140] text-sm"
                    >
                      Spotify <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {app.socialLinks?.instagram && (
                    <a
                      href={app.socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#39b54a] hover:text-[#2e9140] text-sm"
                    >
                      Instagram <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Download ZIP */}
                <button
                  onClick={() => handleDownload(app.id)}
                  className="flex items-center gap-1.5 text-[#39b54a] hover:text-[#2e9140] text-sm mb-4"
                >
                  <Download className="w-4 h-4" />
                  Download sample pack
                </button>

                {/* Review Note (for already reviewed) */}
                {app.reviewNote && app.status !== "PENDING" && (
                  <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3 mb-4">
                    <p className="text-xs text-[#666] mb-1">Review Note</p>
                    <p className="text-sm text-[#a1a1a1]">{app.reviewNote}</p>
                    {app.reviewer && (
                      <p className="text-xs text-[#666] mt-1">
                        by {app.reviewer.username || "Unknown"} on{" "}
                        {app.reviewedAt
                          ? new Date(app.reviewedAt).toLocaleDateString()
                          : ""}
                      </p>
                    )}
                  </div>
                )}

                {/* Review Actions (only for PENDING) */}
                {app.status === "PENDING" && (
                  <div className="border-t border-[#2a2a2a] pt-4 mt-4">
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-white mb-2">
                        Review Notes
                      </label>
                      <textarea
                        value={reviewNotes[app.id] || ""}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [app.id]: e.target.value,
                          }))
                        }
                        placeholder="Enter approval message or denial reason..."
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleReview(app.id, "approve")}
                        disabled={reviewingId === app.id}
                        className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140]"
                      >
                        {reviewingId === app.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleReview(app.id, "deny")}
                        disabled={reviewingId === app.id}
                        className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                      >
                        {reviewingId === app.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4 mr-2" />
                        )}
                        Deny
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <CheckCircle2 className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {filter === "ALL" ? "No applications yet" : `No ${filter.toLowerCase()} applications`}
            </h3>
            <p className="text-[#a1a1a1]">
              {filter === "PENDING"
                ? "All caught up! No pending applications to review."
                : "No creator applications match this filter."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

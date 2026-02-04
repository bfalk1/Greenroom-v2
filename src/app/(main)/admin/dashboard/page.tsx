"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Users,
  Music,
  CheckCircle2,
  Clock,
  Loader2,
  ExternalLink,
  Download,
  XCircle,
  Filter,
} from "lucide-react";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";
import { CSVExport } from "@/components/admin/CSVExport";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
import { toast } from "sonner";

interface Stats {
  totalUsers: number;
  totalCreators: number;
  totalSamples: number;
  totalPurchases: number;
  pendingApplications: number;
  pendingSamples: number;
}

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

interface SampleCreator {
  id: string;
  fullName: string | null;
  artistName: string | null;
  username: string | null;
  email: string;
}

interface DraftSample {
  id: string;
  name: string;
  creatorId: string;
  genre: string;
  instrumentType: string;
  sampleType: string;
  key: string | null;
  bpm: number | null;
  creditPrice: number;
  status: string;
  fileUrl: string | null;
  previewUrl: string | null;
  tags: string[];
  creator: SampleCreator;
}

// Map API sample to the shape SampleModerationPanel expects
function mapSampleForPanel(s: DraftSample) {
  return {
    id: s.id,
    name: s.name,
    creator_id: s.creatorId,
    genre: s.genre,
    instrument_type: s.instrumentType,
    sample_type: s.sampleType,
    key: s.key || "",
    bpm: s.bpm ?? undefined,
    credit_price: s.creditPrice,
    status: s.status,
    file_url: s.previewUrl || s.fileUrl || undefined,
    tags: s.tags,
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [draftSamples, setDraftSamples] = useState<DraftSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("applications");
  const [editingSample, setEditingSample] = useState<ReturnType<
    typeof mapSampleForPanel
  > | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, appsRes, samplesRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/mod/applications?status=PENDING"),
        fetch("/api/mod/samples"),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (appsRes.ok) {
        const data = await appsRes.json();
        setApplications(data.applications);
      }
      if (samplesRes.ok) {
        const data = await samplesRes.json();
        setDraftSamples(data.samples);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

      await fetchData();
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
      if (!res.ok) throw new Error("Failed to get download URL");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch {
      toast.error("Failed to download file");
    }
  };

  const handleSampleModerate = async (
    sampleId: string,
    action: "approve" | "reject"
  ) => {
    try {
      const res = await fetch("/api/mod/samples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to moderate sample");
      }

      toast.success(
        action === "approve" ? "Sample published!" : "Sample rejected."
      );
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to moderate sample"
      );
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/30">
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Admin Dashboard
          </h1>
          <p className="text-[#a1a1a1]">
            Review creator applications and moderate content
          </p>
        </div>

        {/* Platform Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Users
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.totalUsers ?? "—"}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Creators
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.totalCreators ?? "—"}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Samples
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.totalSamples ?? "—"}
                </p>
              </div>
              <Music className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Purchases
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.totalPurchases ?? "—"}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        {/* Action Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Pending Applications
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.pendingApplications ?? applications.length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Samples Awaiting Review
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats?.pendingSamples ?? draftSamples.length}
                </p>
              </div>
              <Music className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2a2a2a]">
          <button
            onClick={() => setActiveTab("applications")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "applications"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Creator Applications ({applications.length})
          </button>
          <button
            onClick={() => setActiveTab("samples")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "samples"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Music className="w-4 h-4 inline mr-2" />
            Sample Moderation ({draftSamples.length})
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "tools"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            Admin Tools
          </button>
        </div>

        {/* Content */}
        <div>
          {activeTab === "applications" && (
            <div>
              {applications.length > 0 ? (
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
                            {new Date(app.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </p>
                        </div>
                        {statusBadge(app.status)}
                      </div>

                      {/* Bio */}
                      {app.bio && (
                        <p className="text-[#a1a1a1] text-sm mb-4">
                          {app.bio}
                        </p>
                      )}

                      {/* Social Links */}
                      <div className="flex flex-wrap gap-3 mb-4">
                        {app.socialLinks?.soundcloud && (
                          <a
                            href={app.socialLinks.soundcloud}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[#00FF88] hover:text-[#00cc6a] text-sm"
                          >
                            SoundCloud <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {app.socialLinks?.spotify && (
                          <a
                            href={app.socialLinks.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[#00FF88] hover:text-[#00cc6a] text-sm"
                          >
                            Spotify <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {app.socialLinks?.instagram && (
                          <a
                            href={app.socialLinks.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[#00FF88] hover:text-[#00cc6a] text-sm"
                          >
                            Instagram <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Download ZIP */}
                      <button
                        onClick={() => handleDownload(app.id)}
                        className="flex items-center gap-1.5 text-[#00FF88] hover:text-[#00cc6a] text-sm mb-4"
                      >
                        <Download className="w-4 h-4" />
                        Download sample pack
                      </button>

                      {/* Review Actions */}
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
                              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#00FF88]"
                              rows={3}
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleReview(app.id, "approve")}
                              disabled={reviewingId === app.id}
                              className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a]"
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
                    All caught up!
                  </h3>
                  <p className="text-[#a1a1a1]">
                    No pending creator applications to review.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "samples" && (
            <div>
              {draftSamples.length > 0 ? (
                <div className="space-y-6">
                  {draftSamples.map((sample) => {
                    const panelSample = mapSampleForPanel(sample);
                    return (
                      <div key={sample.id} className="relative">
                        <SampleModerationPanel
                          sample={panelSample}
                          creator={{
                            full_name:
                              sample.creator.artistName ||
                              sample.creator.fullName ||
                              sample.creator.username ||
                              "Unknown",
                          }}
                          onModerate={() =>
                            handleSampleModerate(sample.id, "approve")
                          }
                        />
                        <div className="absolute top-4 right-4 flex gap-2">
                          <Button
                            onClick={() => setEditingSample(panelSample)}
                            className="bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                          >
                            Edit Metadata
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <CheckCircle2 className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    All caught up!
                  </h3>
                  <p className="text-[#a1a1a1]">
                    No samples awaiting moderation.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "tools" && (
            <div className="space-y-6">
              <UserSearchPanel />
              <CSVExport />
            </div>
          )}
        </div>

        {/* Edit Sample Modal */}
        {editingSample && (
          <EditSampleModal
            sample={editingSample}
            open={!!editingSample}
            onClose={() => setEditingSample(null)}
            onSave={() => {
              setEditingSample(null);
              fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}

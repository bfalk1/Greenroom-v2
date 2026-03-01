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
  DollarSign,
  Settings,
  Shield,
  Trash2,
  Plus,
  Flag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
import { FlaggedAccountsPanel } from "@/components/admin/FlaggedAccountsPanel";
import { CreatorInvitePanel } from "@/components/admin/CreatorInvitePanel";
import { toast } from "sonner";

interface Stats {
  totalUsers: number;
  totalCreators: number;
  totalSamples: number;
  totalPurchases: number;
  totalDownloads: number;
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

interface PayoutCreator {
  id: string;
  email: string;
  username: string | null;
  name: string;
  stripeConnected: boolean;
}

interface PayoutRequest {
  id: string;
  creatorId: string;
  creator: PayoutCreator;
  periodStart: string;
  periodEnd: string;
  totalCreditsSpent: number;
  amountUsd: number;
  status: string;
  stripeTransferId: string | null;
  paidAt: string | null;
  createdAt: string;
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

interface PlatformSettings {
  creatorPayoutRate: number;
  creditValueCents: number;
}

interface Moderator {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
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
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [payoutFilter, setPayoutFilter] = useState<string>("PENDING");
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("applications");
  const [editingSample, setEditingSample] = useState<ReturnType<
    typeof mapSampleForPanel
  > | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  
  // Settings state
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    creatorPayoutRate: 70,
    creditValueCents: 10,
  });
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [newModEmail, setNewModEmail] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingMod, setAddingMod] = useState(false);
  const [removingModId, setRemovingModId] = useState<string | null>(null);

  const fetchPayouts = useCallback(async (status?: string) => {
    try {
      const filterStatus = status ?? payoutFilter;
      const url = filterStatus
        ? `/api/admin/payouts?status=${filterStatus}`
        : "/api/admin/payouts";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPayoutRequests(data.payouts);
      }
    } catch (error) {
      console.error("Failed to fetch payouts:", error);
    }
  }, [payoutFilter]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setPlatformSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  }, []);

  const fetchModerators = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/moderators");
      if (res.ok) {
        const data = await res.json();
        setModerators(data.moderators);
      }
    } catch (error) {
      console.error("Failed to fetch moderators:", error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, appsRes, samplesRes, payoutsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/mod/applications?status=PENDING"),
        fetch("/api/mod/samples"),
        fetch("/api/admin/payouts?status=PENDING"),
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
      if (payoutsRes.ok) {
        const data = await payoutsRes.json();
        setPayoutRequests(data.payouts);
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

  const handlePayoutAction = async (
    payoutId: string,
    action: "approve" | "reject"
  ) => {
    const confirmed = window.confirm(
      action === "approve"
        ? "Approve this payout? Make sure you've sent the payment."
        : "Reject this payout request?"
    );
    if (!confirmed) return;

    setProcessingPayoutId(payoutId);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process payout");
      }

      toast.success(
        action === "approve"
          ? "Payout approved and marked as paid!"
          : "Payout request rejected."
      );
      await fetchPayouts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to process payout"
      );
    } finally {
      setProcessingPayoutId(null);
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

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platformSettings),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save settings");
      }

      toast.success("Settings saved!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save settings"
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddModerator = async () => {
    if (!newModEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setAddingMod(true);
    try {
      const res = await fetch("/api/admin/moderators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newModEmail.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add moderator");
      }

      toast.success("Moderator added!");
      setNewModEmail("");
      await fetchModerators();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add moderator"
      );
    } finally {
      setAddingMod(false);
    }
  };

  const handleRemoveModerator = async (userId: string) => {
    const confirmed = window.confirm("Remove this moderator?");
    if (!confirmed) return;

    setRemovingModId(userId);
    try {
      const res = await fetch(`/api/admin/moderators?userId=${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove moderator");
      }

      toast.success("Moderator removed");
      await fetchModerators();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove moderator"
      );
    } finally {
      setRemovingModId(null);
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
            onClick={() => {
              setActiveTab("payouts");
              fetchPayouts("PENDING");
            }}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "payouts"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <DollarSign className="w-4 h-4 inline mr-2" />
            Payouts
            {payoutRequests.filter((p) => p.status === "PENDING").length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400">
                {payoutRequests.filter((p) => p.status === "PENDING").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("flagged")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "flagged"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Flag className="w-4 h-4 inline mr-2" />
            Flagged Accounts
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
          <button
            onClick={() => {
              setActiveTab("settings");
              fetchSettings();
              fetchModerators();
            }}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "settings"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            Settings
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

          {activeTab === "payouts" && (
            <div>
              {/* Filter buttons */}
              <div className="flex gap-2 mb-6">
                {["PENDING", "PAID", "FAILED", ""].map((status) => (
                  <button
                    key={status || "ALL"}
                    onClick={() => {
                      setPayoutFilter(status);
                      fetchPayouts(status);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      payoutFilter === status
                        ? "bg-[#00FF88] text-black"
                        : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#2a2a2a]"
                    }`}
                  >
                    {status || "All"}
                  </button>
                ))}
              </div>

              {payoutRequests.length > 0 ? (
                <div className="space-y-4">
                  {payoutRequests.map((payout) => (
                    <div
                      key={payout.id}
                      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            {payout.creator.name}
                          </h3>
                          <p className="text-sm text-[#a1a1a1]">
                            {payout.creator.email}
                            {payout.creator.username &&
                              ` (@${payout.creator.username})`}
                          </p>
                          <p className="text-xs text-[#666] mt-1">
                            Requested{" "}
                            {new Date(payout.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 mt-1 text-xs font-medium ${
                              payout.creator.stripeConnected
                                ? "text-[#635bff]"
                                : "text-red-400"
                            }`}
                          >
                            {payout.creator.stripeConnected
                              ? "✓ Stripe connected"
                              : "✗ No Stripe account"}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            payout.status === "PAID"
                              ? "bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/30"
                              : payout.status === "PENDING"
                              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                              : "bg-red-500/20 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {payout.status === "PAID" && (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {payout.status === "PENDING" && (
                            <Clock className="w-3 h-3" />
                          )}
                          {payout.status === "FAILED" && (
                            <XCircle className="w-3 h-3" />
                          )}
                          {payout.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">Amount</p>
                          <p className="text-lg font-bold text-[#00FF88]">
                            ${payout.amountUsd.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Credits Earned
                          </p>
                          <p className="text-lg font-bold text-white">
                            {payout.totalCreditsSpent}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Period Start
                          </p>
                          <p className="text-sm text-white">
                            {new Date(
                              payout.periodStart
                            ).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Period End
                          </p>
                          <p className="text-sm text-white">
                            {new Date(payout.periodEnd).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {(payout.paidAt || payout.stripeTransferId) && (
                        <div className="text-xs text-[#a1a1a1] mb-4 space-y-1">
                          {payout.paidAt && (
                            <p>
                              Paid on{" "}
                              {new Date(payout.paidAt).toLocaleDateString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </p>
                          )}
                          {payout.stripeTransferId && (
                            <p className="font-mono text-[#635bff]">
                              Transfer: {payout.stripeTransferId}
                            </p>
                          )}
                        </div>
                      )}

                      {payout.status === "PENDING" && (
                        <div className="border-t border-[#2a2a2a] pt-4">
                          {!payout.creator.stripeConnected && (
                            <p className="text-xs text-red-400 mb-3 flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Creator has not connected Stripe. Approval will
                              trigger a transfer — it will fail without a
                              connected account.
                            </p>
                          )}
                          <div className="flex gap-3">
                            <Button
                              onClick={() =>
                                handlePayoutAction(payout.id, "approve")
                              }
                              disabled={processingPayoutId === payout.id}
                              className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                            >
                              {processingPayoutId === payout.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                              )}
                              Approve & Send via Stripe
                            </Button>
                            <Button
                              onClick={() =>
                                handlePayoutAction(payout.id, "reject")
                              }
                              disabled={processingPayoutId === payout.id}
                              className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                            >
                              {processingPayoutId === payout.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4 mr-2" />
                              )}
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <DollarSign className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No payout requests
                  </h3>
                  <p className="text-[#a1a1a1]">
                    {payoutFilter === "PENDING"
                      ? "No pending payout requests to review."
                      : `No ${payoutFilter.toLowerCase() || ""} payouts found.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "flagged" && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <FlaggedAccountsPanel />
            </div>
          )}

          {activeTab === "tools" && (
            <div className="space-y-6">
              {/* Payout Settings */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-[#00FF88]/10 rounded-lg">
                    <DollarSign className="w-5 h-5 text-[#00FF88]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Creator Payout Rate</h3>
                    <p className="text-sm text-[#a1a1a1]">Flat rate paid to creators per credit</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-white mb-2">
                    Payout Per Credit (cents)
                  </label>
                  <p className="text-xs text-[#666] mb-2">
                    Amount in cents paid to creator for each credit spent on their sample
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      value={platformSettings.creditValueCents}
                      onChange={(e) =>
                        setPlatformSettings((prev) => ({
                          ...prev,
                          creditValueCents: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white"
                    />
                    <span className="text-[#a1a1a1]">¢ per credit</span>
                  </div>
                  <p className="text-xs text-[#a1a1a1] mt-2">
                    Example: A 2-credit sample pays creator ${((platformSettings.creditValueCents * 2) / 100).toFixed(2)}
                  </p>
                </div>

                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Save Payout Rate
                </Button>
              </div>

              <CreatorInvitePanel />
              <UserSearchPanel />
              <AuditLogPanel />
              <ExportPanel />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-8">
              {/* Moderator Whitelist */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Moderator Whitelist</h3>
                    <p className="text-sm text-[#a1a1a1]">Manage users who can moderate content</p>
                  </div>
                </div>

                {/* Add Moderator */}
                <div className="flex gap-3 mb-6">
                  <Input
                    type="email"
                    placeholder="Enter user email to add as moderator..."
                    value={newModEmail}
                    onChange={(e) => setNewModEmail(e.target.value)}
                    className="flex-1 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
                    onKeyDown={(e) => e.key === "Enter" && handleAddModerator()}
                  />
                  <Button
                    onClick={handleAddModerator}
                    disabled={addingMod || !newModEmail.trim()}
                    className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                  >
                    {addingMod ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Moderator List */}
                {moderators.length > 0 ? (
                  <div className="space-y-3">
                    {moderators.map((mod) => (
                      <div
                        key={mod.id}
                        className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-lg border border-[#2a2a2a]"
                      >
                        <div className="flex items-center gap-3">
                          {mod.avatarUrl ? (
                            <img
                              src={mod.avatarUrl}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <Shield className="w-5 h-5 text-purple-400" />
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium">
                              {mod.artistName || mod.fullName || mod.username || "Unknown"}
                            </p>
                            <p className="text-xs text-[#a1a1a1]">{mod.email}</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleRemoveModerator(mod.id)}
                          disabled={removingModId === mod.id}
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          {removingModId === mod.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-[#2a2a2a] mx-auto mb-3" />
                    <p className="text-[#a1a1a1]">No moderators added yet</p>
                    <p className="text-xs text-[#666]">Add users by their email address</p>
                  </div>
                )}
              </div>
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

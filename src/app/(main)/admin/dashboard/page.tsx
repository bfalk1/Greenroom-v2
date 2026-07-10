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
  LayoutDashboard,
  Mail,
  UserPlus,
  Infinity as InfinityIcon,
  FileText,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { AdminSidebar, AdminSidebarItem } from "@/components/admin/AdminSidebar";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
import { FlaggedAccountsPanel } from "@/components/admin/FlaggedAccountsPanel";
import { CreatorInvitePanel } from "@/components/admin/CreatorInvitePanel";
import { BetaInvitePanel } from "@/components/admin/BetaInvitePanel";
import { InviteInfiniteUserPanel } from "@/components/admin/InviteInfiniteUserPanel";
import { CreatorUploadsPanel } from "@/components/admin/CreatorUploadsPanel";
import AnalyticsOverview from "@/components/admin/analytics/AnalyticsOverview";
import { toast } from "sonner";

type AdminSection =
  | "overview"
  | "applications"
  | "samples"
  | "creator-uploads"
  | "payouts"
  | "flagged"
  | "tools"
  | "payout-settings"
  | "beta-invites"
  | "creator-invites"
  | "infinite-invites"
  | "moderators"
  | "audit-log"
  | "exports";

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
}

interface PayoutRequest {
  id: string;
  creatorId: string;
  creator: PayoutCreator;
  periodStart: string;
  periodEnd: string;
  totalCreditsSpent: number;
  amountUsd: number;
  processingFeeUsd: number;
  netAmountUsd: number;
  invoiceNumber: string | null;
  status: string;
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
  payoutFeeBps: number;
  payoutFeeFixedCents: number;
}

interface CustomRateCreator {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  customPayoutRate: number;
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
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [editingSample, setEditingSample] = useState<ReturnType<
    typeof mapSampleForPanel
  > | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  
  // Settings state
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    creatorPayoutRate: 7,
    creditValueCents: 10,
    payoutFeeBps: 290,
    payoutFeeFixedCents: 30,
  });
  const [customRateCreators, setCustomRateCreators] = useState<CustomRateCreator[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [newModEmail, setNewModEmail] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingMod, setAddingMod] = useState(false);
  const [removingModId, setRemovingModId] = useState<string | null>(null);

  const sidebarItems: AdminSidebarItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "applications",
      label: "Applications",
      icon: Users,
      badge: stats?.pendingApplications,
    },
    {
      id: "samples",
      label: "Samples",
      icon: Music,
      badge: stats?.pendingSamples,
    },
    { id: "creator-uploads", label: "Creator Uploads", icon: Upload },
    { id: "payouts", label: "Payouts", icon: DollarSign },
    { id: "flagged", label: "Flagged", icon: Flag },
    { id: "tools", label: "Tools", icon: Settings },
  ];

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
        setCustomRateCreators(data.customRateCreators ?? []);
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
    fetchSettings();
  }, [fetchData, fetchSettings]);

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
    action: "approve" | "reject",
    netAmountUsd?: number
  ) => {
    const confirmed = window.confirm(
      action === "approve"
        ? `Approve this payout? Make sure you've sent the net amount${
            netAmountUsd != null ? ` of $${netAmountUsd.toFixed(2)}` : ""
          }.`
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
      await fetchSettings();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
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

        {/* Sidebar layout */}
        <div className="flex flex-col md:flex-row gap-6">
          <AdminSidebar
            items={sidebarItems}
            activeId={activeSection}
            onSelect={(id) => {
              const next = id as AdminSection;
              setActiveSection(next);
              if (next === "payouts") {
                fetchPayouts("PENDING");
              }
              if (next === "tools") {
                fetchSettings();
              }
            }}
          />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeSection === "overview" && (
            <AnalyticsOverview
              onNavigate={(id) => {
                // Preset moderation lives on the mod queue page, not in a
                // dashboard section.
                if (id === "presets") {
                  router.push("/mod/samples");
                  return;
                }
                const next = id as AdminSection;
                setActiveSection(next);
                if (next === "payouts") {
                  fetchPayouts("PENDING");
                }
                if (next === "tools") {
                  fetchSettings();
                }
              }}
            />
          )}
          {activeSection === "applications" && (
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
                    All caught up!
                  </h3>
                  <p className="text-[#a1a1a1]">
                    No pending creator applications to review.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeSection === "samples" && (
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
                          onModerate={(action) =>
                            handleSampleModerate(sample.id, action)
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

          {activeSection === "payouts" && (
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
                        ? "bg-[#39b54a] text-black"
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
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            payout.status === "PAID"
                              ? "bg-[#39b54a]/20 text-[#39b54a] border border-[#39b54a]/30"
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

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Gross Earnings
                          </p>
                          <p className="text-lg font-bold text-white">
                            ${payout.amountUsd.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Processing Fee
                          </p>
                          <p className="text-lg font-bold text-[#a1a1a1]">
                            −${payout.processingFeeUsd.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#a1a1a1] mb-1">
                            Net to Send
                          </p>
                          <p className="text-lg font-bold text-[#39b54a]">
                            ${payout.netAmountUsd.toFixed(2)}
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
                          <p className="text-xs text-[#a1a1a1] mb-1">Period</p>
                          <p className="text-sm text-white">
                            {new Date(payout.periodStart).toLocaleDateString()}{" "}
                            –{" "}
                            {new Date(payout.periodEnd).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <a
                          href={`/api/creator/payouts/${payout.id}/invoice`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-[#39b54a] hover:text-[#2e9140]"
                        >
                          <FileText className="w-4 h-4" />
                          {payout.invoiceNumber
                            ? `Invoice ${payout.invoiceNumber}`
                            : "View invoice"}
                        </a>
                      </div>

                      {payout.paidAt && (
                        <div className="text-xs text-[#a1a1a1] mb-4 space-y-1">
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
                        </div>
                      )}

                      {payout.status === "PENDING" && (
                        <div className="border-t border-[#2a2a2a] pt-4">
                          <p className="text-xs text-[#a1a1a1] mb-3">
                            Approving marks this payout as paid — send the net
                            amount (${payout.netAmountUsd.toFixed(2)}) manually
                            before approving. The processing fee is covered by
                            the creator.
                          </p>
                          <div className="flex gap-3">
                            <Button
                              onClick={() =>
                                handlePayoutAction(
                                  payout.id,
                                  "approve",
                                  payout.netAmountUsd
                                )
                              }
                              disabled={processingPayoutId === payout.id}
                              className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140]"
                            >
                              {processingPayoutId === payout.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                              )}
                              Approve & Mark Paid
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

          {activeSection === "flagged" && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <FlaggedAccountsPanel />
            </div>
          )}

          {activeSection === "creator-uploads" && (
            <CreatorUploadsPanel />
          )}

          {activeSection === "tools" && (
            <div className="space-y-6">
              {/* Payout Settings */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#39b54a]/10 rounded-lg">
                      <DollarSign className="w-5 h-5 text-[#39b54a]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Creator Payout Rate</h3>
                      <p className="text-sm text-[#a1a1a1]">Flat rate paid to creators per credit</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#a1a1a1] mb-1">Current global rate</p>
                    <p className="text-2xl font-bold text-[#39b54a]">
                      {platformSettings.creatorPayoutRate}¢
                      <span className="text-sm font-normal text-[#a1a1a1]"> / credit</span>
                    </p>
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
                      max="50"
                      value={platformSettings.creatorPayoutRate}
                      onChange={(e) =>
                        setPlatformSettings((prev) => ({
                          ...prev,
                          creatorPayoutRate: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white"
                    />
                    <span className="text-[#a1a1a1]">¢ per credit</span>
                  </div>
                  <p className="text-xs text-[#a1a1a1] mt-2">
                    Example: A 2-credit sale pays the creator ${((platformSettings.creatorPayoutRate * 2) / 100).toFixed(2)}
                  </p>
                </div>

                <div className="mb-6 border-t border-[#2a2a2a] pt-6">
                  <label className="block text-sm font-medium text-white mb-2">
                    Payout Processing Fee
                  </label>
                  <p className="text-xs text-[#666] mb-2">
                    Deducted from each payout and covered by the creator —
                    locked in when the payout is requested. Set to match what
                    the payment provider charges to send the money.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      step="0.1"
                      value={platformSettings.payoutFeeBps / 100}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setPlatformSettings((prev) => ({
                          ...prev,
                          payoutFeeBps: Number.isNaN(v)
                            ? 0
                            : Math.round(v * 100),
                        }));
                      }}
                      className="w-24 bg-[#0a0a0a] border-[#2a2a2a] text-white"
                    />
                    <span className="text-[#a1a1a1]">% +</span>
                    <Input
                      type="number"
                      min="0"
                      max="500"
                      value={platformSettings.payoutFeeFixedCents}
                      onChange={(e) =>
                        setPlatformSettings((prev) => ({
                          ...prev,
                          payoutFeeFixedCents: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-24 bg-[#0a0a0a] border-[#2a2a2a] text-white"
                    />
                    <span className="text-[#a1a1a1]">¢ fixed</span>
                  </div>
                  <p className="text-xs text-[#a1a1a1] mt-2">
                    Example: on a $50.00 payout the fee is $
                    {(
                      Math.min(
                        5000,
                        Math.ceil((5000 * platformSettings.payoutFeeBps) / 10000) +
                          platformSettings.payoutFeeFixedCents
                      ) / 100
                    ).toFixed(2)}{" "}
                    — the creator receives $
                    {(
                      (5000 -
                        Math.min(
                          5000,
                          Math.ceil(
                            (5000 * platformSettings.payoutFeeBps) / 10000
                          ) + platformSettings.payoutFeeFixedCents
                        )) /
                      100
                    ).toFixed(2)}
                  </p>
                </div>

                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                >
                  {savingSettings ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Save Payout Settings
                </Button>

                {/* Creators with a custom rate override */}
                <div className="border-t border-[#2a2a2a] mt-6 pt-6">
                  <h4 className="text-sm font-semibold text-white mb-1">
                    Creators with custom rates
                  </h4>
                  <p className="text-xs text-[#666] mb-4">
                    These creators keep their custom rate — changing the global
                    rate above does not affect them. Manage overrides from the
                    user search panel below.
                  </p>
                  {customRateCreators.length > 0 ? (
                    <div className="space-y-2">
                      {customRateCreators.map((creator) => (
                        <div
                          key={creator.id}
                          className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {creator.artistName ||
                                creator.username ||
                                creator.email}
                            </p>
                            <p className="text-xs text-[#a1a1a1] truncate">
                              {creator.email}
                              {creator.username && ` (@${creator.username})`}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="text-sm font-bold text-[#39b54a]">
                              {creator.customPayoutRate}¢ / credit
                            </p>
                            <p className="text-xs text-[#666]">
                              global: {platformSettings.creatorPayoutRate}¢
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#a1a1a1]">
                      All creators use the global rate.
                    </p>
                  )}
                </div>
              </div>

              <InviteInfiniteUserPanel />
              <BetaInvitePanel />
              <CreatorInvitePanel />
              <UserSearchPanel />
              <AuditLogPanel />
              <ExportPanel />
            </div>
          )}

        </div>
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

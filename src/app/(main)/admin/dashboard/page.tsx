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
  CreditCard,
  Infinity as InfinityIcon,
  FileText,
  Upload,
  Inbox,
  MessageSquare,
  Megaphone,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { AdminSidebar, AdminSidebarItem } from "@/components/admin/AdminSidebar";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { type AiScanSummary } from "@/components/admin/AiScanBadge";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
import { ModerationReasonModal } from "@/components/admin/ModerationReasonModal";
import { FlaggedAccountsPanel } from "@/components/admin/FlaggedAccountsPanel";
import { CreatorInvitePanel } from "@/components/admin/CreatorInvitePanel";
import { BetaInvitePanel } from "@/components/admin/BetaInvitePanel";
import { InviteInfiniteUserPanel } from "@/components/admin/InviteInfiniteUserPanel";
import { CreatorUploadsPanel } from "@/components/admin/CreatorUploadsPanel";
import AnalyticsOverview from "@/components/admin/analytics/AnalyticsOverview";
import { MessageUserModal } from "@/components/admin/MessageUserModal";
import { useUnreadCount } from "@/lib/hooks/useUnreadCount";
import { SubscribersPanel } from "@/components/admin/SubscribersPanel";
import { BroadcastPanel } from "@/components/admin/BroadcastPanel";
import { toast } from "sonner";

type AdminSection =
  | "overview"
  | "subscribers"
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
  | "notifications"
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
  /** Where to send the money. Null = creator set none; approval is blocked. */
  paypalEmail: string | null;
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

interface CreatorBalance {
  creatorId: string;
  name: string;
  email: string;
  username: string | null;
  owedUsd: number;
  catalogUsd: number;
  referralUsd: number;
  adjustmentUsd: number;
  meetsMinimum: boolean;
}

interface CreatorBalancesResponse {
  creators: CreatorBalance[];
  totalOwed: number;
  readyToPay: number;
  minPayout: number;
  count: number;
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
  audioScan?: AiScanSummary | null;
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
    audio_scan: s.audioScan ?? null,
  };
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [draftSamples, setDraftSamples] = useState<DraftSample[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [payoutFilter, setPayoutFilter] = useState<string>("PENDING");
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [creatorBalances, setCreatorBalances] =
    useState<CreatorBalancesResponse | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [editingSample, setEditingSample] = useState<ReturnType<
    typeof mapSampleForPanel
  > | null>(null);
  const [rejectingSampleId, setRejectingSampleId] = useState<string | null>(
    null
  );
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [messagingApp, setMessagingApp] = useState<Application | null>(null);
  const { total: staffUnread } = useUnreadCount({ staff: true });

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
    { id: "subscribers", label: "Subscribers", icon: CreditCard },
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
    {
      id: "messages",
      label: "Messages",
      icon: Inbox,
      badge: staffUnread || undefined,
    },
    { id: "notifications", label: "Notifications", icon: Megaphone },
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

  const fetchCreatorBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const res = await fetch("/api/admin/creator-balances");
      if (res.ok) {
        setCreatorBalances(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch creator balances:", error);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

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
    action: "approve" | "reject",
    reviewNote?: string
  ) => {
    try {
      const res = await fetch("/api/mod/samples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId, action, reviewNote }),
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
              // Messaging lives on the staff inbox page, not in a dashboard
              // section (same cross-nav pattern as presets).
              if (id === "messages") {
                router.push("/mod/inbox");
                return;
              }
              const next = id as AdminSection;
              setActiveSection(next);
              if (next === "payouts") {
                fetchPayouts("PENDING");
                fetchCreatorBalances();
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
          {activeSection === "subscribers" && <SubscribersPanel />}
          {activeSection === "notifications" && <BroadcastPanel />}
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
                            <Button
                              onClick={() => setMessagingApp(app)}
                              variant="ghost"
                              className="border border-[#2a2a2a] hover:bg-[#1a1a1a] text-[#a1a1a1]"
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Message applicant
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Message applicant (already reviewed) */}
                      {app.status !== "PENDING" && (
                        <div className="border-t border-[#2a2a2a] pt-4 mt-4">
                          <Button
                            onClick={() => setMessagingApp(app)}
                            variant="ghost"
                            className="border border-[#2a2a2a] hover:bg-[#1a1a1a] text-[#a1a1a1]"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Message applicant
                          </Button>
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
                            action === "reject"
                              ? setRejectingSampleId(sample.id)
                              : handleSampleModerate(sample.id, action)
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
              {/* Live per-creator balances — what each creator is owed right
                  now, computed with the SAME helpers as the payout cron. This
                  surfaces amounts (e.g. flat bonuses) that don't yet have a
                  CreatorPayout row, so they're visible before the 1st-of-month
                  cron queues them. */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-8">
                <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-white">
                    Owed to creators
                  </h2>
                  <button
                    onClick={() => fetchCreatorBalances()}
                    disabled={balancesLoading}
                    className="text-xs text-[#a1a1a1] hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {balancesLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Refresh
                  </button>
                </div>
                <p className="text-xs text-[#666] mb-5">
                  Current unpaid balance per creator (catalog + referral +
                  bonuses − already paid/pending). Creators below the $
                  {(creatorBalances?.minPayout ?? 50).toFixed(2)} minimum aren&apos;t
                  auto-queued by the monthly cron yet.
                </p>

                {balancesLoading && !creatorBalances ? (
                  <div className="py-10 text-center text-[#a1a1a1]">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Computing balances…
                  </div>
                ) : creatorBalances && creatorBalances.creators.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
                      <div>
                        <p className="text-xs text-[#a1a1a1] mb-1">Total owed</p>
                        <p className="text-2xl font-bold text-white">
                          ${creatorBalances.totalOwed.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#a1a1a1] mb-1">
                          Ready to pay (≥ ${creatorBalances.minPayout.toFixed(2)})
                        </p>
                        <p className="text-2xl font-bold text-[#39b54a]">
                          ${creatorBalances.readyToPay.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#a1a1a1] mb-1">
                          Creators owed
                        </p>
                        <p className="text-2xl font-bold text-white">
                          {creatorBalances.count}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-[#a1a1a1] border-b border-[#2a2a2a]">
                            <th className="py-2 pr-4 font-medium">Artist</th>
                            <th className="py-2 px-4 font-medium text-right">
                              Catalog
                            </th>
                            <th className="py-2 px-4 font-medium text-right">
                              Referral
                            </th>
                            <th className="py-2 px-4 font-medium text-right">
                              Bonus
                            </th>
                            <th className="py-2 px-4 font-medium text-right">
                              Owed
                            </th>
                            <th className="py-2 pl-4 font-medium text-right">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {creatorBalances.creators.map((c) => (
                            <tr
                              key={c.creatorId}
                              className="border-b border-[#1f1f1f]"
                            >
                              <td className="py-2.5 pr-4">
                                <span className="text-white font-medium">
                                  {c.name}
                                </span>
                                <span className="block text-xs text-[#666]">
                                  {c.email}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right text-[#a1a1a1]">
                                ${c.catalogUsd.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 text-right text-[#a1a1a1]">
                                ${c.referralUsd.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {c.adjustmentUsd > 0 ? (
                                  <span className="text-[#39b54a]">
                                    ${c.adjustmentUsd.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-[#444]">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right text-white font-bold">
                                ${c.owedUsd.toFixed(2)}
                              </td>
                              <td className="py-2.5 pl-4 text-right">
                                {c.meetsMinimum ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-[#39b54a]">
                                    <CheckCircle2 className="w-3 h-3" /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                                    <Clock className="w-3 h-3" /> Below min
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-[#a1a1a1] text-sm">
                    No creators are currently owed a balance.
                  </div>
                )}
              </div>

              <h2 className="text-lg font-bold text-white mb-4">
                Payout requests
              </h2>
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

                      {/* Destination — the address to actually send money to. */}
                      <div className="mb-4 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3">
                        <p className="text-xs text-[#a1a1a1] mb-1">
                          Send via PayPal to
                        </p>
                        {payout.creator.paypalEmail ? (
                          <p className="text-sm text-white font-medium break-all">
                            {payout.creator.paypalEmail}
                          </p>
                        ) : (
                          <p className="text-sm text-yellow-400 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            No PayPal email on file — the creator must add one
                            before this can be approved.
                          </p>
                        )}
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
                              disabled={
                                processingPayoutId === payout.id ||
                                !payout.creator.paypalEmail
                              }
                              title={
                                payout.creator.paypalEmail
                                  ? undefined
                                  : "Creator has no PayPal payout email on file"
                              }
                              className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Reject reason — the API refuses a reason-less rejection */}
        <ModerationReasonModal
          open={rejectingSampleId !== null}
          onClose={() => setRejectingSampleId(null)}
          onConfirm={async (reason) => {
            if (!rejectingSampleId) return;
            await handleSampleModerate(rejectingSampleId, "reject", reason);
            setRejectingSampleId(null);
          }}
          title="Reject sample"
          description="Sent back to draft so the creator can revise and resubmit."
          confirmLabel="Reject sample"
        />

        {/* Message Applicant Modal */}
        <MessageUserModal
          open={!!messagingApp}
          onClose={() => setMessagingApp(null)}
          defaultUser={
            messagingApp
              ? {
                  id: messagingApp.userId,
                  label: `${messagingApp.artistName} (${messagingApp.user.email})`,
                }
              : undefined
          }
          contextType="CreatorApplication"
          contextId={messagingApp?.id}
          defaultSubject="About your creator application"
        />
      </div>
    </div>
  );
}

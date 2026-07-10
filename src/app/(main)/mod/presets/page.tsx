"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sliders,
  CheckCircle2,
  Loader2,
  Search,
  Flag,
  Trash2,
  Star,
  Shield,
  Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import { toast } from "sonner";

const SYNTH_DISPLAY_NAMES: Record<string, string> = {
  SERUM: "Serum",
  ASTRA: "Astra",
  SERUM_2: "Serum 2",
  PHASE_PLANT: "Phase Plant",
  SPLICE: "Splice",
  VITAL: "Vital",
  SYLENTH1: "Sylenth1",
  MASSIVE: "Massive",
  BEAT_MAKER: "Beat Maker",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  BASS: "Bass",
  LEAD: "Lead",
  PAD: "Pad",
  PLUCK: "Pluck",
  FX: "FX",
  KEYS: "Keys",
  ARP: "Arp",
  SEQUENCE: "Sequence",
  OTHER: "Other",
};

interface PresetCreator {
  id: string;
  fullName: string | null;
  artistName: string | null;
  username: string | null;
  email: string;
  isWhitelisted: boolean;
  isFlagged: boolean;
}

interface ModPreset {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  creatorId: string;
  synthName: string;
  presetCategory: string;
  genre: string;
  tags: string[];
  creditPrice: number;
  previewUrl: string | null;
  coverImageUrl: string | null;
  fileSizeBytes: number | null;
  compatibleVersions: string[];
  isInitPreset: boolean;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  status: string;
  isActive: boolean;
  createdAt: string;
  creator: PresetCreator;
}

const PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const STATUS_OPTIONS = ["ALL", "REVIEW", "PUBLISHED", "DRAFT", "REMOVED"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "bg-green-500/20 text-green-400";
    case "REVIEW":
      return "bg-yellow-500/20 text-yellow-400";
    case "REMOVED":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-[#2a2a2a] text-[#a1a1a1]";
  }
}

export default function ModPresetsPage() {
  const [presets, setPresets] = useState<ModPreset[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeTab, setActiveTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<StatusFilter>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flaggingCreator, setFlaggingCreator] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const fetchData = useCallback(
    async (
      status: StatusFilter,
      search = "",
      opts: { offset?: number; append?: boolean; limit?: number } = {}
    ) => {
      const { offset = 0, append = false, limit = PAGE_SIZE } = opts;
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const params = new URLSearchParams();
        params.set("status", status);
        if (search) params.set("search", search);
        params.set("limit", String(limit));
        params.set("offset", String(offset));

        const res = await fetch(`/api/mod/presets?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setPresets(prev => (append ? [...prev, ...data.presets] : data.presets));
          setTotal(data.total ?? 0);
        } else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load presets");
        }
      } catch (error) {
        console.error("Failed to fetch presets:", error);
        toast.error(error instanceof Error ? error.message : "Failed to load presets");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  // The pending count drives the tab label; refreshed after every mutation.
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/mod/presets?status=REVIEW&limit=1");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.total ?? 0);
      }
    } catch {
      // non-fatal — label just shows a stale count
    }
  }, []);

  useEffect(() => {
    fetchData("REVIEW", "");
    fetchPendingCount();
  }, [fetchData, fetchPendingCount]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "pending") {
      fetchData("REVIEW", "");
    } else if (tab === "search") {
      fetchData(searchStatus, searchQuery);
    }
  };

  const handleSearch = () => {
    fetchData(searchStatus, searchQuery);
  };

  // Re-fetch the current list after a mutation, keeping paged-in rows loaded.
  const refreshCurrent = () => {
    if (activeTab === "search") {
      fetchData(searchStatus, searchQuery, {
        limit: Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, presets.length)),
      });
    } else {
      fetchData("REVIEW", "", {
        limit: Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, presets.length)),
      });
    }
    fetchPendingCount();
  };

  const handleLoadMore = () => {
    if (activeTab === "search") {
      fetchData(searchStatus, searchQuery, { offset: presets.length, append: true });
    } else {
      fetchData("REVIEW", "", { offset: presets.length, append: true });
    }
  };

  const handleModerate = async (presetId: string, action: "approve" | "reject") => {
    setBusyId(presetId);
    try {
      const res = await fetch("/api/mod/presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to moderate preset");
      }
      toast.success(action === "approve" ? "Preset published!" : "Preset sent back to draft.");
      refreshCurrent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to moderate preset");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm("Delete this preset? It will be unpublished and permanently removed from the marketplace.")) return;
    setBusyId(presetId);
    try {
      const res = await fetch(`/api/mod/presets?presetId=${presetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete preset");
      toast.success("Preset removed");
      refreshCurrent();
    } catch {
      toast.error("Failed to delete preset");
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (presetId: string) => {
    try {
      const res = await fetch(`/api/mod/presets/${presetId}/download`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to get download link");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download preset");
    }
  };

  const handleFlagCreator = async (creatorId: string) => {
    if (!flagReason.trim()) {
      toast.error("Please provide a reason for flagging");
      return;
    }
    try {
      const res = await fetch("/api/mod/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, reason: flagReason }),
      });
      if (!res.ok) throw new Error("Failed to flag creator");
      toast.success("Creator flagged for admin review");
      setFlaggingCreator(null);
      setFlagReason("");
      refreshCurrent();
    } catch {
      toast.error("Failed to flag creator");
    }
  };

  if (loading && presets.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  const loadMoreFooter = presets.length < total && (
    <div className="flex flex-col items-center gap-2 pt-4">
      <p className="text-xs text-[#666]">
        Showing {presets.length} of {total} presets
      </p>
      <Button
        onClick={handleLoadMore}
        disabled={loadingMore}
        variant="outline"
        className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
      >
        {loadingMore && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Load more
      </Button>
    </div>
  );

  const renderPresetCard = (preset: ModPreset, opts: { showStatus?: boolean } = {}) => {
    const synthDisplay = SYNTH_DISPLAY_NAMES[preset.synthName] || preset.synthName;
    const categoryDisplay = CATEGORY_DISPLAY_NAMES[preset.presetCategory] || preset.presetCategory;
    const isBusy = busyId === preset.id;
    return (
      <div
        key={preset.id}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
      >
        <div className="flex items-start gap-4">
          {/* Cover */}
          <div className="relative w-16 h-16 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
            {preset.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preset.coverImageUrl} alt={preset.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Sliders className="w-6 h-6 text-[#3a3a3a]" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-white font-medium truncate" title={preset.name}>{preset.name}</h3>
              {opts.showStatus && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadgeClass(preset.status)}`}>
                  {preset.status}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs bg-[#39b54a]/15 text-[#39b54a] border border-[#39b54a]/30">
                {synthDisplay}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-[#2a2a2a] text-[#a1a1a1]">
                {categoryDisplay}
              </span>
              {preset.creator.isWhitelisted && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                  <Shield className="w-3 h-3 inline mr-1" />
                  Whitelisted
                </span>
              )}
            </div>
            <p className="text-sm text-[#a1a1a1] mt-1 truncate">
              by {preset.creator.artistName || preset.creator.fullName || preset.creator.email}
              {" · "}
              {preset.genre}
              {" · "}
              {preset.creditPrice} cr
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-[#666]">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3" />
                {preset.ratingAvg.toFixed(1)} ({preset.ratingCount})
              </span>
              <span>{preset.downloadCount} downloads</span>
              {preset.compatibleVersions.length > 0 && (
                <span className="truncate">{preset.compatibleVersions.join(", ")}</span>
              )}
            </div>
            {preset.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {preset.tags.slice(0, 6).map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#39b54a]/50 text-[#39b54a]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preview audio */}
        {preset.previewUrl && (
          <div className="mt-3">
            <AudioPlayer fileUrl={preset.previewUrl} compact />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {preset.status === "REVIEW" && (
            <>
              <Button
                onClick={() => handleModerate(preset.id, "approve")}
                disabled={isBusy}
                size="sm"
                className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                {isBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Approve
              </Button>
              <Button
                onClick={() => handleModerate(preset.id, "reject")}
                disabled={isBusy}
                size="sm"
                variant="outline"
                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              >
                Reject
              </Button>
            </>
          )}
          <Button
            onClick={() => handleDownload(preset.id)}
            size="sm"
            variant="outline"
            className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            <Download className="w-4 h-4 mr-1" />
            File
          </Button>
          {preset.status !== "REMOVED" && (
            <Button
              onClick={() => handleDelete(preset.id)}
              disabled={isBusy}
              size="sm"
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {!preset.creator.isFlagged && (
            <Button
              onClick={() => setFlaggingCreator(preset.creatorId)}
              size="sm"
              variant="outline"
              className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
            >
              <Flag className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Preset Moderation</h1>
        <p className="text-[#a1a1a1] mb-8">
          Review, approve, and take down community presets.
        </p>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-1 mb-8">
            <TabsTrigger
              value="pending"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              Pending Review ({pendingCount})
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <Search className="w-4 h-4 mr-2" />
              Search All
            </TabsTrigger>
          </TabsList>

          {/* Pending Review */}
          <TabsContent value="pending" className="space-y-4">
            {presets.length > 0 ? (
              <>
                {presets.map(p => renderPresetCard(p))}
                {loadMoreFooter}
              </>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-[#39b54a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">All presets have been reviewed!</p>
              </div>
            )}
          </TabsContent>

          {/* Search All */}
          <TabsContent value="search" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-3 w-5 h-5 text-[#a1a1a1]" />
                <Input
                  type="text"
                  placeholder="Search by name, genre, creator..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-12 bg-[#1a1a1a] border-[#2a2a2a] text-white"
                />
              </div>
              <select
                value={searchStatus}
                onChange={(e) => setSearchStatus(e.target.value as StatusFilter)}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39b54a]"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>
                ))}
              </select>
              <Button onClick={handleSearch} className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
                Search
              </Button>
            </div>

            {presets.length > 0 ? (
              <>
                <p className="text-xs text-[#666]">{total} result{total === 1 ? "" : "s"}</p>
                {presets.map(p => renderPresetCard(p, { showStatus: true }))}
                {loadMoreFooter}
              </>
            ) : (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">No presets match your search.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Flag Creator Modal */}
        {flaggingCreator && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Flag className="w-5 h-5 text-yellow-400" />
                Flag Creator for Review
              </h3>
              <p className="text-[#a1a1a1] text-sm mb-4">
                This will flag the account for admin review. Provide a reason:
              </p>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="Reason for flagging..."
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] mb-4"
                rows={3}
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setFlaggingCreator(null);
                    setFlagReason("");
                  }}
                  variant="outline"
                  className="flex-1 border-[#2a2a2a]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleFlagCreator(flaggingCreator)}
                  className="flex-1 bg-yellow-500 text-black hover:bg-yellow-400"
                >
                  Flag Account
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

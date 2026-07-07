"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Music,
  CheckCircle2,
  Users,
  AlertCircle,
  Loader2,
  Search,
  Flag,
  Trash2,
  Star,
  Calendar,
  TrendingDown,
  Shield,
  CheckSquare,
  Square,
  Pencil,
  X,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
import { BulkEditSampleModal } from "@/components/admin/BulkEditSampleModal";
import { formatSampleType } from "@/lib/utils/sampleType";
import { toast } from "sonner";

interface SampleCreator {
  id: string;
  fullName: string | null;
  artistName: string | null;
  username: string | null;
  email: string;
  isWhitelisted: boolean;
  isFlagged: boolean;
}

interface APISample {
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
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  creator: SampleCreator;
}

interface APIPreset {
  id: string;
  name: string;
  creatorId: string;
  description: string | null;
  synthName: string;
  presetCategory: string;
  genre: string;
  tags: string[];
  creditPrice: number;
  status: string;
  createdAt: string;
  previewUrl: string | null;
  creator: SampleCreator;
}

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

interface Stats {
  totalSamples: number;
  publishedSamples: number;
  totalCreators: number;
  totalPurchases: number;
  pendingSamples: number;
  samplesThisMonth: number;
  samplesThisYear: number;
}

interface PanelSample {
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
  preview_ready: boolean;
}

function mapSampleForPanel(s: APISample): PanelSample {
  const previewReady = !!(s.previewUrl && s.previewUrl.startsWith("previews/"));
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
    file_url: previewReady ? (s.previewUrl ?? undefined) : (s.fileUrl || undefined),
    tags: s.tags,
    preview_ready: previewReady,
  };
}

const PAGE_SIZE = 50;
// The API caps limit at 200; post-action refreshes reuse it to keep the loaded window.
const MAX_LIMIT = 200;

export default function ModSamplesPage() {
  const [samples, setSamples] = useState<APISample[]>([]);
  const [total, setTotal] = useState(0);
  const [lowestRatedSamples, setLowestRatedSamples] = useState<APISample[]>([]);
  const [editingSample, setEditingSample] = useState<PanelSample | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [flaggingCreator, setFlaggingCreator] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [presets, setPresets] = useState<APIPreset[]>([]);
  const [presetsTotal, setPresetsTotal] = useState(0);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsLoadingMore, setPresetsLoadingMore] = useState(false);
  const [presetBusyId, setPresetBusyId] = useState<string | null>(null);

  const fetchData = useCallback(
    async (
      view = "pending",
      search = "",
      opts: { offset?: number; append?: boolean; limit?: number } = {}
    ) => {
      const { offset = 0, append = false, limit = PAGE_SIZE } = opts;
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const params = new URLSearchParams();
        params.set("view", view);
        if (search) params.set("search", search);
        params.set("limit", String(limit));
        params.set("offset", String(offset));

        const [statsRes, samplesRes] = await Promise.all([
          append ? Promise.resolve(null) : fetch("/api/admin/stats"),
          fetch(`/api/mod/samples?${params.toString()}`),
        ]);

        if (statsRes?.ok) {
          const data = await statsRes.json();
          setStats({
            totalSamples: data.totalSamples,
            publishedSamples: data.publishedSamples,
            totalCreators: data.totalCreators,
            totalPurchases: data.totalPurchases,
            pendingSamples: data.pendingSamples,
            samplesThisMonth: 0,
            samplesThisYear: 0,
          });
        }

        if (samplesRes.ok) {
          const data = await samplesRes.json();
          setSamples(prev => (append ? [...prev, ...data.samples] : data.samples));
          setTotal(data.total ?? 0);
          if (data.stats) {
            setStats(prev => prev ? {
              ...prev,
              samplesThisMonth: data.stats.samplesThisMonth,
              samplesThisYear: data.stats.samplesThisYear,
              totalSamples: data.stats.totalSamples,
            } : null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to load moderation data");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  const fetchLowestRated = useCallback(async () => {
    try {
      const res = await fetch("/api/mod/samples?view=lowest-rated&limit=20");
      if (res.ok) {
        const data = await res.json();
        setLowestRatedSamples(data.samples);
      }
    } catch (error) {
      console.error("Failed to fetch lowest rated:", error);
    }
  }, []);

  // Presets awaiting moderation (GET defaults to status=REVIEW).
  const fetchPresets = useCallback(
    async (opts: { offset?: number; append?: boolean; limit?: number } = {}) => {
      const { offset = 0, append = false, limit = PAGE_SIZE } = opts;
      try {
        if (append) setPresetsLoadingMore(true);
        else setPresetsLoading(true);
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const res = await fetch(`/api/mod/presets?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch presets");
        const data = await res.json();
        setPresets((prev) => (append ? [...prev, ...data.presets] : data.presets));
        setPresetsTotal(data.total ?? 0);
      } catch (error) {
        console.error("Failed to fetch presets:", error);
        toast.error("Failed to load preset queue");
      } finally {
        if (append) setPresetsLoadingMore(false);
        else setPresetsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchData(activeTab === "search" ? "all" : "pending", "");
    fetchLowestRated();
    fetchPresets();
  }, [fetchData, fetchLowestRated, fetchPresets]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedIds(new Set()); // selection is list-specific — don't carry it across tabs
    if (tab === "pending") {
      fetchData("pending", "");
    } else if (tab === "search") {
      fetchData("all", searchQuery);
    } else if (tab === "lowest-rated") {
      // Already fetched
    } else if (tab === "presets") {
      fetchPresets();
    }
  };

  const handleSearch = () => {
    fetchData("all", searchQuery);
  };

  // Re-fetch the current list after a mutation, keeping everything the user
  // has paged in loaded (rather than collapsing back to the first page).
  const refreshCurrent = () => {
    const view = activeTab === "search" ? "all" : "pending";
    const search = activeTab === "search" ? searchQuery : "";
    fetchData(view, search, {
      limit: Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, samples.length)),
    });
  };

  const handleLoadMore = () => {
    const view = activeTab === "search" ? "all" : "pending";
    const search = activeTab === "search" ? searchQuery : "";
    fetchData(view, search, { offset: samples.length, append: true });
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
      refreshCurrent();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to moderate sample"
      );
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Delete this sample? It will be unpublished and removed from the marketplace.")) return;
    
    try {
      const res = await fetch(`/api/mod/samples?sampleId=${sampleId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete sample");
      }

      toast.success("Sample deleted");
      refreshCurrent();
      fetchLowestRated();
    } catch (error) {
      toast.error("Failed to delete sample");
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

      if (!res.ok) {
        throw new Error("Failed to flag creator");
      }

      toast.success("Creator flagged for admin review");
      setFlaggingCreator(null);
      setFlagReason("");
      refreshCurrent();
    } catch (error) {
      toast.error("Failed to flag creator");
    }
  };

  // ---- Preset moderation ----
  // Re-fetch the queue after a mutation, keeping everything paged in loaded.
  const refreshPresets = () => {
    fetchPresets({
      limit: Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, presets.length)),
    });
  };

  const handlePresetModerate = async (
    presetId: string,
    action: "approve" | "reject"
  ) => {
    setPresetBusyId(presetId);
    try {
      const res = await fetch("/api/mod/presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId, action }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to moderate preset");
      }

      toast.success(
        action === "approve" ? "Preset published!" : "Preset sent back to draft."
      );
      refreshPresets();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to moderate preset"
      );
    } finally {
      setPresetBusyId(null);
    }
  };

  const handlePresetRemove = async (presetId: string) => {
    if (!confirm("Remove this preset? This is a permanent takedown — the creator cannot resubmit it.")) return;

    setPresetBusyId(presetId);
    try {
      const res = await fetch(`/api/mod/presets?presetId=${presetId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove preset");
      }

      toast.success("Preset removed");
      refreshPresets();
    } catch (error) {
      toast.error("Failed to remove preset");
    } finally {
      setPresetBusyId(null);
    }
  };

  const handlePresetDownload = async (presetId: string) => {
    setPresetBusyId(presetId);
    try {
      const res = await fetch(`/api/mod/presets/${presetId}/download`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to get download link");
      }
      // Signed URL forces attachment — an anchor click avoids popup blockers.
      const a = document.createElement("a");
      a.href = data.url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download preset"
      );
    } finally {
      setPresetBusyId(null);
    }
  };

  // ---- Bulk selection & actions ----
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = samples.length > 0 && samples.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (samples.every((s) => next.has(s.id))) {
        samples.forEach((s) => next.delete(s.id));
      } else {
        samples.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const runBulk = async (payload: {
    action?: "approve" | "reject" | "delete";
    metadata?: Record<string, unknown>;
  }) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/mod/samples/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleIds: [...selectedIds], ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      toast.success(
        data.message ||
          `Updated ${data.updated} sample${data.updated === 1 ? "" : "s"}` +
            (data.skipped ? `, skipped ${data.skipped}` : "")
      );
      setSelectedIds(new Set());
      refreshCurrent();
      fetchLowestRated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkReject = () => {
    if (!confirm(`Reject ${selectedIds.size} selected sample(s)?`)) return;
    runBulk({ action: "reject" });
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} selected sample(s)? They'll be unpublished and removed from the marketplace.`)) return;
    runBulk({ action: "delete" });
  };

  if (loading && samples.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  const loadMoreFooter = samples.length < total && (
    <div className="flex flex-col items-center gap-2 pt-4">
      <p className="text-xs text-[#666]">
        Showing {samples.length} of {total} samples
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedIds.size > 0 && (
          <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#141414]/95 backdrop-blur border-b border-[#39b54a]/30 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-white">{selectedIds.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setBulkEditOpen(true)}
                disabled={bulkBusy}
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
              >
                <Pencil className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button
                size="sm"
                onClick={() => runBulk({ action: "approve" })}
                disabled={bulkBusy}
                className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkReject}
                disabled={bulkBusy}
                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
            {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-[#a1a1a1] hover:text-white flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}

        <h1 className="text-3xl font-bold text-white mb-8">
          Moderation Dashboard
        </h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-[#39b54a]" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">Total</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.totalSamples ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">Published</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.publishedSamples ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">Pending</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.pendingSamples ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">Creators</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.totalCreators ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">This Month</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.samplesThisMonth ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-medium text-[#a1a1a1]">This Year</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats?.samplesThisYear ?? "—"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-1 mb-8">
            <TabsTrigger
              value="pending"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              Pending Review ({stats?.pendingSamples ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <Search className="w-4 h-4 mr-2" />
              Search All
            </TabsTrigger>
            <TabsTrigger
              value="lowest-rated"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              Lowest Rated
            </TabsTrigger>
            <TabsTrigger
              value="presets"
              className="data-[state=active]:bg-[#39b54a] data-[state=active]:text-black"
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Presets ({presetsTotal})
            </TabsTrigger>
          </TabsList>

          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-6">
            {samples.length > 0 ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs text-[#a1a1a1] hover:text-white"
                >
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#39b54a]" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                {samples.map((sample) => {
                const panelSample = mapSampleForPanel(sample);
                return (
                  <div key={sample.id} className="flex items-start gap-3">
                    <button
                      onClick={() => toggleSelect(sample.id)}
                      className="mt-4 flex-shrink-0"
                      title={selectedIds.has(sample.id) ? "Deselect" : "Select"}
                    >
                      {selectedIds.has(sample.id) ? (
                        <CheckSquare className="w-5 h-5 text-[#39b54a]" />
                      ) : (
                        <Square className="w-5 h-5 text-[#3a3a3a] hover:text-white" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
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
                    actions={
                      <>
                        {sample.creator.isWhitelisted && (
                          <span className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                            <Shield className="w-3 h-3 inline mr-1" />
                            Whitelisted
                          </span>
                        )}
                        <Button
                          onClick={() => setEditingSample(panelSample)}
                          className="bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                          size="sm"
                        >
                          Edit
                        </Button>
                        {!sample.creator.isFlagged && (
                          <Button
                            onClick={() => setFlaggingCreator(sample.creatorId)}
                            variant="outline"
                            size="sm"
                            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            <Flag className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    }
                  />
                    </div>
                  </div>
                );
              })}
              {loadMoreFooter}
              </>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-[#39b54a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  All samples have been reviewed!
                </p>
              </div>
            )}
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <div className="flex gap-4 mb-6">
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
              <Button
                onClick={handleSearch}
                className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                Search
              </Button>
            </div>

            {samples.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-xs text-[#a1a1a1] hover:text-white"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#39b54a]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  <p className="text-xs text-[#666]">
                    {total} result{total === 1 ? "" : "s"}
                  </p>
                </div>
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => toggleSelect(sample.id)}
                        className="flex-shrink-0"
                        title={selectedIds.has(sample.id) ? "Deselect" : "Select"}
                      >
                        {selectedIds.has(sample.id) ? (
                          <CheckSquare className="w-5 h-5 text-[#39b54a]" />
                        ) : (
                          <Square className="w-5 h-5 text-[#3a3a3a] hover:text-white" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-white font-medium">{sample.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            sample.status === "PUBLISHED"
                              ? "bg-green-500/20 text-green-400"
                              : sample.status === "REVIEW"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : sample.status === "REMOVED"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-[#2a2a2a] text-[#a1a1a1]"
                          }`}>
                            {sample.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-[#39b54a]/15 text-[#39b54a] border border-[#39b54a]/30">
                            {formatSampleType(sample.sampleType)}
                          </span>
                        </div>
                        <p className="text-sm text-[#a1a1a1] mt-1">
                          by {sample.creator.artistName || sample.creator.email} · {sample.genre} · {sample.instrumentType}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[#666]">
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {sample.ratingAvg.toFixed(1)} ({sample.ratingCount})
                          </span>
                          <span>{sample.downloadCount} downloads</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setEditingSample(mapSampleForPanel(sample))}
                          size="sm"
                          variant="outline"
                          className="border-[#2a2a2a]"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleDeleteSample(sample.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        {!sample.creator.isFlagged && (
                          <Button
                            onClick={() => setFlaggingCreator(sample.creatorId)}
                            size="sm"
                            variant="outline"
                            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            <Flag className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 pl-8">
                      <AudioPlayer sampleId={sample.id} useFullAudio compact />
                    </div>
                  </div>
                ))}
                {loadMoreFooter}
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  Search for samples to review
                </p>
              </div>
            )}
          </TabsContent>

          {/* Lowest Rated Tab */}
          <TabsContent value="lowest-rated" className="space-y-6">
            <p className="text-sm text-[#a1a1a1] mb-4">
              Published samples with ratings below 3.0 stars
            </p>
            {lowestRatedSamples.length > 0 ? (
              <div className="space-y-4">
                {lowestRatedSamples.map((sample) => (
                  <div
                    key={sample.id}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-white font-medium">{sample.name}</h3>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-[#39b54a]/15 text-[#39b54a] border border-[#39b54a]/30">
                            {formatSampleType(sample.sampleType)}
                          </span>
                        </div>
                        <p className="text-sm text-[#a1a1a1] mt-1">
                          by {sample.creator.artistName || sample.creator.email}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1 text-red-400">
                            <Star className="w-4 h-4 fill-current" />
                            {sample.ratingAvg.toFixed(1)} ({sample.ratingCount} ratings)
                          </span>
                          <span className="text-xs text-[#666]">
                            {sample.downloadCount} downloads
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setEditingSample(mapSampleForPanel(sample))}
                          size="sm"
                          variant="outline"
                          className="border-[#2a2a2a]"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleDeleteSample(sample.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <AudioPlayer sampleId={sample.id} useFullAudio compact />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Star className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  No low-rated samples found
                </p>
              </div>
            )}
          </TabsContent>

          {/* Presets Tab */}
          <TabsContent value="presets" className="space-y-6">
            <p className="text-sm text-[#a1a1a1] mb-4">
              Synth presets awaiting review — approve to publish, reject to send back to draft
            </p>
            {presetsLoading && presets.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
              </div>
            ) : presets.length > 0 ? (
              <div className="space-y-4">
                {presets.map((preset) => {
                  const busy = presetBusyId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-white font-medium">{preset.name}</h3>
                            <span className="px-2 py-0.5 rounded-full text-xs bg-[#39b54a]/15 text-[#39b54a] border border-[#39b54a]/30">
                              {SYNTH_DISPLAY_NAMES[preset.synthName] || preset.synthName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs bg-[#2a2a2a] text-[#a1a1a1]">
                              {CATEGORY_DISPLAY_NAMES[preset.presetCategory] || preset.presetCategory}
                            </span>
                            {preset.creator.isWhitelisted && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                                <Shield className="w-3 h-3 inline mr-1" />
                                Whitelisted
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[#a1a1a1] mt-1">
                            by {preset.creator.artistName || preset.creator.username || preset.creator.email} · {preset.genre} · {preset.creditPrice} credit{preset.creditPrice === 1 ? "" : "s"}
                          </p>
                          {preset.description && (
                            <p className="text-sm text-[#666] mt-1 line-clamp-2">
                              {preset.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-[#666]">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Uploaded {new Date(preset.createdAt).toLocaleDateString()}
                            </span>
                            {preset.tags.length > 0 && (
                              <span className="truncate">{preset.tags.join(", ")}</span>
                            )}
                          </div>
                          <div className="mt-3">
                            {preset.previewUrl ? (
                              <AudioPlayer fileUrl={preset.previewUrl} compact />
                            ) : (
                              <p className="text-xs text-[#666] italic">
                                No audio preview uploaded
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            onClick={() => handlePresetDownload(preset.id)}
                            disabled={busy}
                            size="sm"
                            variant="outline"
                            className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                            title="Download preset file"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handlePresetModerate(preset.id, "approve")}
                            disabled={busy}
                            size="sm"
                            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            onClick={() => handlePresetModerate(preset.id, "reject")}
                            disabled={busy}
                            size="sm"
                            variant="outline"
                            className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          >
                            Reject
                          </Button>
                          <Button
                            onClick={() => handlePresetRemove(preset.id)}
                            disabled={busy}
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                            title="Remove permanently"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {presets.length < presetsTotal && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <p className="text-xs text-[#666]">
                      Showing {presets.length} of {presetsTotal} presets
                    </p>
                    <Button
                      onClick={() => fetchPresets({ offset: presets.length, append: true })}
                      disabled={presetsLoadingMore}
                      variant="outline"
                      className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                    >
                      {presetsLoadingMore && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-[#39b54a] mx-auto mb-4" />
                <p className="text-[#a1a1a1]">
                  All presets have been reviewed!
                </p>
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

        {/* Edit Sample Modal */}
        {editingSample && (
          <EditSampleModal
            sample={editingSample}
            open={!!editingSample}
            onClose={() => setEditingSample(null)}
            onSave={() => {
              setEditingSample(null);
              refreshCurrent();
              fetchLowestRated();
            }}
          />
        )}

        {/* Bulk Edit Modal */}
        <BulkEditSampleModal
          open={bulkEditOpen}
          count={selectedIds.size}
          onClose={() => setBulkEditOpen(false)}
          onApply={(changes) => runBulk({ metadata: changes })}
        />
      </div>
    </div>
  );
}

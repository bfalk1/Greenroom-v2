"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Eye, Music, Search, Star, Play, Pause, Loader2, CheckSquare, Square, X, Sliders } from "lucide-react";
import { CreatorStats } from "@/components/creator/CreatorStats";
import {
  getSampleTableRowClass,
  SAMPLE_TABLE_WAVEFORM_CLASS,
  SampleTableHeader,
} from "@/components/marketplace/SampleTable";
import { MarketplaceTabs, MarketplaceTab } from "@/components/marketplace/MarketplaceTabs";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";
import { Waveform } from "@/components/audio/Waveform";
import { BulkEditSampleModal } from "@/components/admin/BulkEditSampleModal";

interface CreatorSample {
  id: string;
  name: string;
  slug: string;
  genre: string;
  instrumentType: string;
  sampleType: string;
  key: string | null;
  bpm: number | null;
  creditPrice: number;
  status: string;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  purchases: number;
  downloads: number;
  totalCredits: number;
  earningsUsd: number;
  createdAt: string;
  previewUrl?: string | null;
  waveformData?: number[] | null;
  coverImageUrl?: string | null;
  creatorAvatarUrl?: string | null;
}

// Global audio state
let creatorAudio: HTMLAudioElement | null = null;
let creatorPlayingId: string | null = null;
const creatorSetters = new Map<string, (playing: boolean) => void>();

function getCreatorAudio() {
  if (typeof window === "undefined") return null;
  if (!creatorAudio) {
    creatorAudio = new Audio();
    creatorAudio.addEventListener("ended", () => {
      if (creatorPlayingId) {
        creatorSetters.get(creatorPlayingId)?.(false);
      }
      creatorPlayingId = null;
    });
  }
  return creatorAudio;
}

function CreatorSampleRow({
  sample,
  onEdit,
  onDelete,
  onSubmitForReview,
  selected,
  onToggleSelect,
}: {
  sample: CreatorSample;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmitForReview: (id: string) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<number | null>(null);

  useEffect(() => {
    creatorSetters.set(sample.id, setIsPlayingState);
    return () => {
      creatorSetters.delete(sample.id);
      if (creatorPlayingId === sample.id) {
        getCreatorAudio()?.pause();
        creatorPlayingId = null;
      }
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [sample.id]);

  useEffect(() => {
    const audio = getCreatorAudio();
    if (!audio) return;

    const updateProgress = () => {
      if (creatorPlayingId === sample.id && audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (isPlayingState) {
        progressRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlayingState) {
      progressRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [isPlayingState, sample.id]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const audio = getCreatorAudio();
    if (!audio) return;

    if (creatorPlayingId === sample.id) {
      audio.pause();
      setIsPlayingState(false);
      creatorPlayingId = null;
      setProgress(0);
      return;
    }

    if (creatorPlayingId) {
      creatorSetters.get(creatorPlayingId)?.(false);
      audio.pause();
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}/preview`);
      const data = await res.json();
      if (res.ok && data.url) {
        audio.src = data.url;
        audio.currentTime = 0;
        setProgress(0);
        await audio.play();
        creatorPlayingId = sample.id;
        setIsPlayingState(true);
      }
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={getSampleTableRowClass("creator", {
        isActive: isPlayingState,
      })}
    >
      {/* Selection checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(sample.id);
        }}
        className="flex-shrink-0"
        title={selected ? "Deselect" : "Select"}
      >
        {selected ? (
          <CheckSquare className="w-4 h-4 text-[#39b54a]" />
        ) : (
          <Square className="w-4 h-4 text-[#3a3a3a] hover:text-white" />
        )}
      </button>

      {/* Artist Image + Play Button */}
      <div className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group">
        <img
          src={
            sample.creatorAvatarUrl ||
            sample.coverImageUrl ||
            "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=80&h=80&fit=crop"
          }
          alt={sample.name}
          className="w-full h-full object-cover"
        />
        <button
          onClick={handlePlay}
          className={`absolute inset-0 flex items-center justify-center transition ${
            isPlayingState || isLoading
              ? "bg-black/60"
              : "bg-black/0 group-hover:bg-black/60"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />
          ) : isPlayingState ? (
            <Pause className="w-4 h-4 fill-current text-[#39b54a]" />
          ) : (
            <Play className="w-4 h-4 fill-current text-white opacity-0 group-hover:opacity-100 transition ml-0.5" />
          )}
        </button>
      </div>

      {/* Name */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white" title={sample.name}>
          {sample.name}
        </p>
        <p className="text-xs text-[#666]">
          {sample.creditPrice} credits
        </p>
      </div>

      {/* Waveform */}
      <div className={SAMPLE_TABLE_WAVEFORM_CLASS}>
        <Waveform
          audioUrl={sample.previewUrl || undefined}
          data={sample.waveformData || undefined}
          isPlaying={isPlayingState}
          progress={progress}
          height={36}
          barWidth={2}
          barGap={1}
          barColor={isPlayingState ? "#4a4a4a" : "#3a3a3a"}
          progressColor="#39b54a"
        />
      </div>

      {/* Genre */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {sample.genre || "—"}
      </span>

      {/* Key */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.key || "—"}</span>

      {/* BPM */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.bpm || "—"}</span>

      {/* Rating — only shown once the sample has real ratings */}
      <div className="hidden md:flex items-center gap-1">
        {sample.ratingCount > 0 ? (
          <>
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
            <span className="text-sm text-white">{sample.ratingAvg.toFixed(1)}</span>
            <span className="text-xs text-[#666]">({sample.ratingCount})</span>
          </>
        ) : (
          <>
            <Star className="w-3.5 h-3.5 text-[#3a3a3a]" />
            <span className="text-xs text-[#666]">New</span>
          </>
        )}
      </div>

      {/* Status */}
      <div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            sample.status === "PUBLISHED"
              ? "bg-[#39b54a]/20 text-[#39b54a]"
              : sample.status === "REVIEW"
              ? "bg-yellow-500/20 text-yellow-400"
              : sample.status === "REMOVED"
              ? "bg-red-500/20 text-red-400"
              : "bg-[#2a2a2a] text-[#a1a1a1]"
          }`}
        >
          {sample.status === "REMOVED" ? "Removed by moderator" : sample.status}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        {sample.status === "DRAFT" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSubmitForReview(sample.id)}
            className="h-7 w-7 p-0 text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
            title="Submit for Review"
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
        {sample.status !== "REMOVED" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
            onClick={() => onEdit(sample.id)}
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(sample.id)}
          className="h-7 w-7 p-0 text-[#a1a1a1] hover:text-red-400 hover:bg-red-500/10"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
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

interface CreatorPreset {
  id: string;
  name: string;
  slug: string;
  synthName: string;
  presetCategory: string;
  genre: string;
  tags: string[];
  creditPrice: number;
  coverImageUrl?: string | null;
  creatorAvatarUrl?: string | null;
  previewUrl?: string | null;
  status: string;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  purchases: number;
  downloads: number;
  totalCredits: number;
  earningsUsd: number;
  createdAt: string;
}

// Preset management row — mirrors CreatorSampleRow but preset-shaped: synth +
// category instead of waveform/key/bpm, and no "submit for review" (presets go
// straight to REVIEW on upload). Reuses the same creatorAudio manager so preset
// and sample playback never overlap.
function CreatorPresetRow({
  preset,
  onDelete,
}: {
  preset: CreatorPreset;
  onDelete: (id: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(false);

  useEffect(() => {
    creatorSetters.set(preset.id, setIsPlayingState);
    return () => {
      creatorSetters.delete(preset.id);
      if (creatorPlayingId === preset.id) {
        getCreatorAudio()?.pause();
        creatorPlayingId = null;
      }
    };
  }, [preset.id]);

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!preset.previewUrl) {
      toast.error("No audio preview for this preset");
      return;
    }

    const audio = getCreatorAudio();
    if (!audio) return;

    if (creatorPlayingId === preset.id) {
      audio.pause();
      setIsPlayingState(false);
      creatorPlayingId = null;
      return;
    }

    if (creatorPlayingId) {
      creatorSetters.get(creatorPlayingId)?.(false);
      audio.pause();
    }

    setIsLoading(true);
    try {
      audio.src = preset.previewUrl;
      audio.currentTime = 0;
      await audio.play();
      creatorPlayingId = preset.id;
      setIsPlayingState(true);
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const synthDisplay = SYNTH_DISPLAY_NAMES[preset.synthName] || preset.synthName;
  const categoryDisplay = CATEGORY_DISPLAY_NAMES[preset.presetCategory] || preset.presetCategory;

  return (
    <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_80px_1fr_80px_90px_110px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors hover:bg-[#242424]">
      {/* Cover + Play */}
      <div className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group">
        <img
          src={
            preset.coverImageUrl ||
            preset.creatorAvatarUrl ||
            "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=80&h=80&fit=crop"
          }
          alt={preset.name}
          className="w-full h-full object-cover"
        />
        {preset.previewUrl && (
          <button
            onClick={handlePlay}
            className={`absolute inset-0 flex items-center justify-center transition ${
              isPlayingState || isLoading ? "bg-black/60" : "bg-black/0 group-hover:bg-black/60"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />
            ) : isPlayingState ? (
              <Pause className="w-4 h-4 fill-current text-[#39b54a]" />
            ) : (
              <Play className="w-4 h-4 fill-current text-white opacity-0 group-hover:opacity-100 transition ml-0.5" />
            )}
          </button>
        )}
      </div>

      {/* Synth — hidden on mobile */}
      <span className="hidden md:block text-xs font-medium text-[#39b54a] truncate">
        {synthDisplay}
      </span>

      {/* Name + price */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white" title={preset.name}>
          {preset.name}
        </p>
        <p className="text-xs text-[#666]">
          <span className="md:hidden">{synthDisplay} · </span>
          {preset.creditPrice} credits
        </p>
      </div>

      {/* Category — hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {categoryDisplay}
      </span>

      {/* Genre — hidden on mobile */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {preset.genre || "—"}
      </span>

      {/* Status */}
      <div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            preset.status === "PUBLISHED"
              ? "bg-[#39b54a]/20 text-[#39b54a]"
              : preset.status === "REVIEW"
              ? "bg-yellow-500/20 text-yellow-400"
              : preset.status === "REMOVED"
              ? "bg-red-500/20 text-red-400"
              : "bg-[#2a2a2a] text-[#a1a1a1]"
          }`}
        >
          {preset.status === "REMOVED" ? "Removed by moderator" : preset.status}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(preset.id)}
          className="h-7 w-7 p-0 text-[#a1a1a1] hover:text-red-400 hover:bg-red-500/10"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("samples");
  const [samples, setSamples] = useState<CreatorSample[]>([]);
  const [filteredSamples, setFilteredSamples] = useState<CreatorSample[]>([]);
  const [presets, setPresets] = useState<CreatorPreset[]>([]);
  const [filteredPresets, setFilteredPresets] = useState<CreatorPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsFetched, setPresetsFetched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchSamples = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/creator/samples");
      if (!res.ok) throw new Error("Failed to fetch samples");
      const data = await res.json();
      setSamples(data.samples);
      setFilteredSamples(data.samples);
    } catch (error) {
      console.error("Error fetching samples:", error);
      toast.error("Failed to load your samples");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      setPresetsLoading(true);
      const res = await fetch("/api/creator/presets");
      if (!res.ok) throw new Error("Failed to fetch presets");
      const data = await res.json();
      setPresets(data.presets);
      setFilteredPresets(data.presets);
      setPresetsFetched(true);
    } catch (error) {
      console.error("Error fetching presets:", error);
      toast.error("Failed to load your presets");
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && (user.role === "CREATOR" || user.role === "ADMIN")) {
      fetchSamples();
    } else if (!userLoading && (!user || (user.role !== "CREATOR" && user.role !== "ADMIN"))) {
      setLoading(false);
    }
  }, [user, userLoading, fetchSamples]);

  // Presets are fetched lazily the first time the Presets tab is opened.
  useEffect(() => {
    if (
      activeTab === "presets" &&
      !presetsFetched &&
      user &&
      (user.role === "CREATOR" || user.role === "ADMIN")
    ) {
      fetchPresets();
    }
  }, [activeTab, presetsFetched, user, fetchPresets]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    const q = query.toLowerCase();
    setFilteredSamples(samples.filter((s) => s.name.toLowerCase().includes(q)));
    setFilteredPresets(presets.filter((p) => p.name.toLowerCase().includes(q)));
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm("Delete this preset? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/presets/${presetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Preset deleted");
      fetchPresets();
    } catch {
      toast.error("Failed to delete preset");
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Delete this sample? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Sample deleted");
      fetchSamples();
    } catch {
      toast.error("Failed to delete sample");
    }
  };

  const handleSubmitForReview = async (sampleId: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEW" }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      toast.success("Sample submitted for review!");
      fetchSamples();
    } catch {
      toast.error("Failed to submit sample");
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

  const allSelected =
    filteredSamples.length > 0 && filteredSamples.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filteredSamples.every((s) => next.has(s.id))) {
        filteredSamples.forEach((s) => next.delete(s.id));
      } else {
        filteredSamples.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const runCreatorBulk = async (payload: {
    action?: "submit" | "delete";
    metadata?: Record<string, unknown>;
  }) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/creator/samples/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleIds: [...selectedIds], ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      const n = data.deleted ?? data.updated;
      toast.success(
        `${data.deleted != null ? "Deleted" : "Updated"} ${n} sample${n === 1 ? "" : "s"}`
      );
      setSelectedIds(new Set());
      fetchSamples();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = () => {
    const n = selectedIds.size;
    if (n === 0) return;
    if (
      !confirm(
        `Delete ${n} selected sample${n === 1 ? "" : "s"}? This permanently removes them and their files, and cannot be undone.`
      )
    )
      return;
    runCreatorBulk({ action: "delete" });
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== "CREATOR" && user.role !== "ADMIN")) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Creator Access Required</h2>
          <p className="text-[#a1a1a1] mb-4">
            Apply to become a creator to access your studio.
          </p>
          <Button
            onClick={() => router.push("/marketplace")}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            Browse Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const totalDownloads = samples.reduce((sum, s) => sum + s.downloadCount, 0);
  const totalPurchases = samples.reduce((sum, s) => sum + s.purchases, 0);
  const totalEarnings = samples.reduce(
    (sum, s) => sum + s.purchases * s.creditPrice * 0.03,
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bulk action bar (samples only) */}
        {activeTab === "samples" && selectedIds.size > 0 && (
          <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#141414]/95 backdrop-blur border-b border-[#39b54a]/30 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-white">{selectedIds.size} selected</span>
            <Button
              size="sm"
              onClick={() => setBulkEditOpen(true)}
              disabled={bulkBusy}
              className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
            >
              <Edit2 className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              onClick={() => runCreatorBulk({ action: "submit" })}
              disabled={bulkBusy}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              <Eye className="w-4 h-4 mr-1" /> Submit for Review
            </Button>
            <Button
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="bg-red-500/15 text-red-400 hover:bg-red-500/25"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
            {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-[#39b54a]" />}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-[#a1a1a1] hover:text-white flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Creator Studio</h1>
            <p className="text-[#a1a1a1] mt-1">
              {new Date().toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}{" "}
              — Manage your samples and track earnings
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => router.push("/creator/batch-upload")}
              variant="outline"
              className="border-[#39b54a] text-[#39b54a] hover:bg-[#39b54a]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Batch Upload
            </Button>
            <Button
              onClick={() => router.push("/creator/upload")}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Sample
            </Button>
            <Button
              onClick={() => router.push("/creator/upload-preset")}
              variant="outline"
              className="border-[#39b54a] text-[#39b54a] hover:bg-[#39b54a]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Preset
            </Button>
            <Button
              onClick={() => router.push("/creator/batch-upload-presets")}
              variant="outline"
              className="border-[#39b54a] text-[#39b54a] hover:bg-[#39b54a]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Batch Presets
            </Button>
          </div>
        </div>

        {/* Stats */}
        <CreatorStats
          totalSamples={samples.length}
          totalDownloads={totalDownloads}
          totalEarnings={totalEarnings}
          totalPurchases={totalPurchases}
        />

        {/* Samples / Presets tabs */}
        <div className="mt-6">
          <MarketplaceTabs
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setSearchQuery("");
              setFilteredSamples(samples);
              setFilteredPresets(presets);
            }}
          />
        </div>

        {activeTab === "samples" && (
        <>
        {/* Search */}
        {samples.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-3 w-5 h-5 text-[#a1a1a1]" />
              <Input
                type="text"
                placeholder="Search your samples..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Samples Grid */}
        {filteredSamples.length > 0 ? (
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
            {/* Header */}
            <SampleTableHeader
              variant="creator"
              onToggleAll={toggleSelectAll}
              allSelected={allSelected}
            />

            {/* Rows */}
            <div className="divide-y divide-[#2a2a2a]">
              {filteredSamples.map((sample) => (
                <CreatorSampleRow
                  key={sample.id}
                  sample={sample}
                  onEdit={(id) => router.push(`/creator/edit/${id}`)}
                  onDelete={handleDeleteSample}
                  onSubmitForReview={handleSubmitForReview}
                  selected={selectedIds.has(sample.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              No samples yet
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Upload your first sample to get started.
            </p>
            <Button
              onClick={() => router.push("/creator/upload")}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Sample
            </Button>
          </div>
        )}
        </>
        )}

        {activeTab === "presets" && (
        <>
        {/* Search */}
        {presets.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-3 w-5 h-5 text-[#a1a1a1]" />
              <Input
                type="text"
                placeholder="Search your presets..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Presets Grid */}
        {presetsLoading && !presetsFetched ? (
          <div className="space-y-2">
            {Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse" />
              ))}
          </div>
        ) : filteredPresets.length > 0 ? (
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_80px_1fr_80px_90px_110px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
              <div className="w-10" />
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Synth</span>
              <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Category</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Status</span>
              <div className="text-xs font-medium text-[#a1a1a1]"></div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#2a2a2a]">
              {filteredPresets.map((preset) => (
                <CreatorPresetRow
                  key={preset.id}
                  preset={preset}
                  onDelete={handleDeletePreset}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Sliders className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              No presets yet
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Upload your first preset to get started.
            </p>
            <Button
              onClick={() => router.push("/creator/upload-preset")}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Preset
            </Button>
          </div>
        )}
        </>
        )}

        {/* Creator Terms link */}
        <div className="mt-12 pt-6 border-t border-[#2a2a2a] text-center">
          <p className="text-sm text-[#666]">
            By uploading, you agree to the{" "}
            <Link
              href="/creator-terms"
              className="text-[#39b54a] hover:text-[#2e9140] underline underline-offset-2 transition-colors"
            >
              Creator Terms of Use
            </Link>
            .
          </p>
        </div>

        {/* Bulk Edit Modal */}
        <BulkEditSampleModal
          open={bulkEditOpen}
          count={selectedIds.size}
          onClose={() => setBulkEditOpen(false)}
          onApply={(changes) => runCreatorBulk({ metadata: changes })}
          maxCreditPrice={user?.is_whitelisted ? 50 : 5}
        />
      </div>
    </div>
  );
}

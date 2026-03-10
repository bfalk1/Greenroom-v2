"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Eye, Music, Search, Star, Play, Pause, Loader2 } from "lucide-react";
import { CreatorStats } from "@/components/creator/CreatorStats";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";
import { Waveform } from "@/components/audio/Waveform";

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
}: {
  sample: CreatorSample;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSubmitForReview: (id: string) => void;
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
      className={`grid grid-cols-[auto_1fr_70px_80px] md:grid-cols-[auto_1fr_80px_45px_45px_70px_80px_100px] gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors ${
        isPlayingState ? "bg-[#00FF88]/5" : "hover:bg-[#242424]"
      }`}
    >
      {/* Cover Art + Play Button */}
      <div className="relative w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden group">
        <img
          src={
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
            <Loader2 className="w-4 h-4 animate-spin text-[#00FF88]" />
          ) : isPlayingState ? (
            <Pause className="w-4 h-4 fill-current text-[#00FF88]" />
          ) : (
            <Play className="w-4 h-4 fill-current text-white opacity-0 group-hover:opacity-100 transition ml-0.5" />
          )}
        </button>
      </div>

      {/* Name + Waveform */}
      <div className="min-w-0 flex items-center gap-4 flex-1">
        <div className="min-w-0 w-[200px] flex-shrink-0">
          <p className="text-sm font-medium text-white truncate" title={sample.name}>
            {sample.name}
          </p>
          <p className="text-xs text-[#666]">
            {sample.creditPrice} credits
          </p>
        </div>
        <div className="hidden md:block flex-1 min-w-[100px] max-w-[250px]">
          <Waveform
            audioUrl={sample.previewUrl || undefined}
            data={sample.waveformData || undefined}
            isPlaying={isPlayingState}
            progress={progress}
            height={36}
            barWidth={2}
            barGap={1}
            barColor={isPlayingState ? "#4a4a4a" : "#3a3a3a"}
            progressColor="#00FF88"
          />
        </div>
      </div>

      {/* Genre */}
      <span className="hidden md:block text-sm text-[#a1a1a1] truncate">
        {sample.genre || "—"}
      </span>

      {/* Key */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.key || "—"}</span>

      {/* BPM */}
      <span className="hidden md:block text-sm text-[#a1a1a1]">{sample.bpm || "—"}</span>

      {/* Rating */}
      <div className="hidden md:flex items-center gap-1">
        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
        <span className="text-sm text-white">{sample.ratingAvg.toFixed(1)}</span>
        <span className="text-xs text-[#666]">({sample.ratingCount})</span>
      </div>

      {/* Status */}
      <div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            sample.status === "PUBLISHED"
              ? "bg-[#00FF88]/20 text-[#00FF88]"
              : sample.status === "REVIEW"
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-[#2a2a2a] text-[#a1a1a1]"
          }`}
        >
          {sample.status}
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
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
          onClick={() => onEdit(sample.id)}
          title="Edit"
        >
          <Edit2 className="w-4 h-4" />
        </Button>
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

export default function CreatorDashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [samples, setSamples] = useState<CreatorSample[]>([]);
  const [filteredSamples, setFilteredSamples] = useState<CreatorSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => {
    if (user && (user.role === "CREATOR" || user.role === "ADMIN")) {
      fetchSamples();
    } else if (!userLoading && (!user || (user.role !== "CREATOR" && user.role !== "ADMIN"))) {
      setLoading(false);
    }
  }, [user, userLoading, fetchSamples]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    const filtered = samples.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredSamples(filtered);
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

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== "CREATOR" && user.role !== "ADMIN")) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Creator Access Required</h2>
          <p className="text-[#a1a1a1] mb-4">
            Apply to become a creator to access the dashboard.
          </p>
          <Button
            onClick={() => router.push("/marketplace")}
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Creator Dashboard</h1>
            <p className="text-[#a1a1a1] mt-1">
              {new Date().toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}{" "}
              — Manage your samples and track earnings
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push("/creator/batch-upload")}
              variant="outline"
              className="border-[#00FF88] text-[#00FF88] hover:bg-[#00FF88]/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Batch Upload
            </Button>
            <Button
              onClick={() => router.push("/creator/upload")}
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Sample
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
            <div className="grid grid-cols-[auto_1fr_70px_80px] md:grid-cols-[auto_1fr_80px_45px_45px_70px_80px_100px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
              <div className="w-10" />
              <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Key</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">BPM</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Rating</span>
              <span className="text-xs font-medium text-[#a1a1a1]">Status</span>
              <span className="text-xs font-medium text-[#a1a1a1] text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#2a2a2a]">
              {filteredSamples.map((sample) => (
                <CreatorSampleRow
                  key={sample.id}
                  sample={sample}
                  onEdit={(id) => router.push(`/creator/edit/${id}`)}
                  onDelete={handleDeleteSample}
                  onSubmitForReview={handleSubmitForReview}
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
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Upload Sample
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

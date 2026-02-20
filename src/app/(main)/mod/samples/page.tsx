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
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";
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
}

function mapSampleForPanel(s: APISample): PanelSample {
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

export default function ModSamplesPage() {
  const [samples, setSamples] = useState<APISample[]>([]);
  const [lowestRatedSamples, setLowestRatedSamples] = useState<APISample[]>([]);
  const [editingSample, setEditingSample] = useState<PanelSample | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [flaggingCreator, setFlaggingCreator] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");

  const fetchData = useCallback(async (view = "pending", search = "") => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("view", view);
      if (search) params.set("search", search);

      const [statsRes, samplesRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch(`/api/mod/samples?${params.toString()}`),
      ]);

      if (statsRes.ok) {
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
        setSamples(data.samples);
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
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchData(activeTab === "search" ? "all" : "pending", "");
    fetchLowestRated();
  }, [fetchData, fetchLowestRated]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "pending") {
      fetchData("pending", "");
    } else if (tab === "search") {
      fetchData("all", searchQuery);
    } else if (tab === "lowest-rated") {
      // Already fetched
    }
  };

  const handleSearch = () => {
    fetchData("all", searchQuery);
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
      fetchData(activeTab === "search" ? "all" : "pending", searchQuery);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to moderate sample"
      );
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Delete this sample? This action cannot be undone.")) return;
    
    try {
      const res = await fetch(`/api/mod/samples?sampleId=${sampleId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete sample");
      }

      toast.success("Sample deleted");
      fetchData(activeTab === "search" ? "all" : "pending", searchQuery);
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
      fetchData(activeTab === "search" ? "all" : "pending", searchQuery);
    } catch (error) {
      toast.error("Failed to flag creator");
    }
  };

  if (loading && samples.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">
          Moderation Dashboard
        </h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-[#00FF88]" />
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
              className="data-[state=active]:bg-[#00FF88] data-[state=active]:text-black"
            >
              Pending Review ({stats?.pendingSamples ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="data-[state=active]:bg-[#00FF88] data-[state=active]:text-black"
            >
              <Search className="w-4 h-4 mr-2" />
              Search All
            </TabsTrigger>
            <TabsTrigger
              value="lowest-rated"
              className="data-[state=active]:bg-[#00FF88] data-[state=active]:text-black"
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              Lowest Rated
            </TabsTrigger>
          </TabsList>

          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-6">
            {samples.length > 0 ? (
              samples.map((sample) => {
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
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-[#00FF88] mx-auto mb-4" />
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
                className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
              >
                Search
              </Button>
            </div>

            {samples.length > 0 ? (
              <div className="space-y-4">
                {samples.map((sample) => (
                  <div
                    key={sample.id}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-white font-medium">{sample.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            sample.status === "PUBLISHED"
                              ? "bg-green-500/20 text-green-400"
                              : sample.status === "REVIEW"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-[#2a2a2a] text-[#a1a1a1]"
                          }`}>
                            {sample.status}
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
                  </div>
                ))}
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
                        <h3 className="text-white font-medium">{sample.name}</h3>
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
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#00FF88] mb-4"
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
              fetchData(activeTab === "search" ? "all" : "pending", searchQuery);
              fetchLowestRated();
            }}
          />
        )}
      </div>
    </div>
  );
}

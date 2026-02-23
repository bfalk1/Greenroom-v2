"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Eye, Music, Search, Star } from "lucide-react";
import { CreatorStats } from "@/components/creator/CreatorStats";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

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
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false, status: "DRAFT" }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Sample removed");
      fetchSamples();
    } catch {
      toast.error("Failed to delete sample");
    }
  };

  const handlePublish = async (sampleId: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      toast.success("Sample published!");
      fetchSamples();
    } catch {
      toast.error("Failed to publish sample");
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="animate-pulse text-[#a1a1a1]">Loading...</div>
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
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#a1a1a1]" />
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

        {/* Samples Table */}
        {filteredSamples.length > 0 ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-[#2a2a2a] bg-[#0a0a0a]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Genre
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Instrument
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Purchases
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Downloads
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Rating
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Earnings
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-[#a1a1a1] uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a2a]">
                  {filteredSamples.map((sample) => (
                    <tr
                      key={sample.id}
                      className="hover:bg-[#2a2a2a]/30 transition"
                    >
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{sample.name}</p>
                        <p className="text-xs text-[#a1a1a1]">
                          {sample.creditPrice} credits · {sample.key || "—"}{" "}
                          {sample.bpm ? `· ${sample.bpm} BPM` : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#a1a1a1]">{sample.genre}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#a1a1a1]">{sample.instrumentType}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white">{sample.purchases}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white">{sample.downloadCount}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-[#00FF88]" />
                          <span className="text-white text-sm">
                            {sample.ratingAvg.toFixed(1)}
                          </span>
                          <span className="text-[#a1a1a1] text-xs">
                            ({sample.ratingCount})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[#00FF88] font-medium">
                          ${sample.earningsUsd?.toFixed(2) ?? "0.00"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            sample.status === "PUBLISHED"
                              ? "bg-[#00FF88]/20 text-[#00FF88]"
                              : sample.status === "REVIEW"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-[#2a2a2a] text-[#a1a1a1]"
                          }`}
                        >
                          {sample.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {sample.status === "DRAFT" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePublish(sample.id)}
                              className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
                              title="Publish"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
                            onClick={() =>
                              router.push(`/creator/edit/${sample.id}`)
                            }
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteSample(sample.id)}
                            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

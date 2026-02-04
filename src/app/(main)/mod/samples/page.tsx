"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Music,
  CheckCircle2,
  Users,
  AlertCircle,
  Loader2,
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
  creator: SampleCreator;
}

interface Stats {
  totalSamples: number;
  publishedSamples: number;
  totalCreators: number;
  totalPurchases: number;
  pendingSamples: number;
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
  const [draftSamples, setDraftSamples] = useState<APISample[]>([]);
  const [editingSample, setEditingSample] = useState<PanelSample | null>(null);
  const [activeTab, setActiveTab] = useState("samples");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, samplesRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/mod/samples"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats({
          totalSamples: data.totalSamples,
          publishedSamples: data.publishedSamples,
          totalCreators: data.totalCreators,
          totalPurchases: data.totalPurchases,
          pendingSamples: data.pendingSamples,
        });
      }
      if (samplesRes.ok) {
        const data = await samplesRes.json();
        setDraftSamples(data.samples);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load moderation data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <h1 className="text-3xl font-bold text-white mb-8">
          Moderation Dashboard
        </h1>

        {/* Platform Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Music className="w-5 h-5 text-[#00FF88]" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">
                Total Samples
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.totalSamples ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Published</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.publishedSamples ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Creators</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.totalCreators ?? "—"}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Purchases</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.totalPurchases ?? "—"}
            </p>
          </div>
        </div>

        {/* Action Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-white">
                Pending Review
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {draftSamples.length}
            </p>
            <p className="text-[#a1a1a1] text-sm">
              Samples awaiting moderation
            </p>
          </div>
        </div>

        {/* Moderation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-1 mb-8">
            <TabsTrigger
              value="samples"
              className="data-[state=active]:bg-[#00FF88] data-[state=active]:text-black"
            >
              Sample Moderation ({draftSamples.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="samples" className="space-y-6">
            {draftSamples.length > 0 ? (
              draftSamples.map((sample) => {
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
                    <Button
                      onClick={() => setEditingSample(panelSample)}
                      className="absolute top-4 right-4 bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                    >
                      Edit Metadata
                    </Button>
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
        </Tabs>

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

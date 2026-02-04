"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Music, CheckCircle2, Users, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { EditSampleModal } from "@/components/admin/EditSampleModal";

interface DraftSample {
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

interface Creator {
  full_name: string;
}

const MOCK_DRAFT_SAMPLES: DraftSample[] = [
  {
    id: "d1",
    name: "Dark Ambient Pad",
    creator_id: "c1",
    genre: "Ambient",
    instrument_type: "Synth",
    sample_type: "loop",
    key: "C",
    bpm: 80,
    credit_price: 3,
    status: "draft",
    tags: ["ambient", "dark", "pad"],
  },
];

const MOCK_CREATORS: Record<string, Creator> = {
  c1: { full_name: "DJ Phoenix" },
};

export default function ModSamplesPage() {
  const [draftSamples, setDraftSamples] = useState<DraftSample[]>(MOCK_DRAFT_SAMPLES);
  const [editingSample, setEditingSample] = useState<DraftSample | null>(null);
  const [activeTab, setActiveTab] = useState("samples");

  const stats = {
    totalSamples: 150,
    publishedSamples: 140,
    totalCreators: 25,
    totalPurchases: 500,
  };

  const handleSampleReviewed = () => {
    // TODO: Replace with Supabase/Prisma call
    setDraftSamples([]);
  };

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
              {stats.totalSamples}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Published</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats.publishedSamples}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Creators</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats.totalCreators}
            </p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-[#a1a1a1]">Purchases</h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats.totalPurchases}
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
              draftSamples.map((sample) => (
                <div key={sample.id} className="relative">
                  <SampleModerationPanel
                    sample={sample}
                    creator={MOCK_CREATORS[sample.creator_id]}
                    onModerate={handleSampleReviewed}
                  />
                  <Button
                    onClick={() => setEditingSample(sample)}
                    className="absolute top-4 right-4 bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                  >
                    Edit Metadata
                  </Button>
                </div>
              ))
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
            onSave={handleSampleReviewed}
          />
        )}
      </div>
    </div>
  );
}

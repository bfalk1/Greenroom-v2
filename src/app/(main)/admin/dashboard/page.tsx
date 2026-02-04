"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, Music, CheckCircle2, Clock } from "lucide-react";
import { CreatorReviewPanel } from "@/components/admin/CreatorReviewPanel";
import { SampleModerationPanel } from "@/components/admin/SampleModerationPanel";
import { UserSearchPanel } from "@/components/admin/UserSearchPanel";
import { CSVExport } from "@/components/admin/CSVExport";
import { EditSampleModal } from "@/components/admin/EditSampleModal";

interface Application {
  id: string;
  user_id: string;
  artist_name: string;
  bio: string;
  soundcloud_url?: string;
  spotify_url?: string;
  instagram_url?: string;
  zip_file_url: string;
  status: string;
}

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

const MOCK_APPLICATIONS: Application[] = [];
const MOCK_DRAFT_SAMPLES: DraftSample[] = [];

export default function AdminDashboardPage() {
  const [pendingApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [draftSamples] = useState<DraftSample[]>(MOCK_DRAFT_SAMPLES);
  const [activeTab, setActiveTab] = useState("applications");
  const [editingSample, setEditingSample] = useState<DraftSample | null>(null);

  const stats = {
    totalUsers: 250,
    totalCreators: 25,
    totalSamples: 150,
    totalPurchases: 500,
  };

  const sampleCreators: Record<string, { full_name: string }> = {};

  const handleApplicationReviewed = () => {
    // TODO: Replace with Supabase/Prisma call
  };

  const handleSampleModerated = () => {
    // TODO: Replace with Supabase/Prisma call
  };

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

        {/* Platform Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Users
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats.totalUsers}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Creators
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats.totalCreators}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Samples
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats.totalSamples}
                </p>
              </div>
              <Music className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Total Purchases
                </p>
                <p className="text-3xl font-bold text-white">
                  {stats.totalPurchases}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        {/* Action Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Pending Applications
                </p>
                <p className="text-3xl font-bold text-white">
                  {pendingApplications.length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
          <div className="p-6 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#a1a1a1] mb-1">
                  Samples Awaiting Review
                </p>
                <p className="text-3xl font-bold text-white">
                  {draftSamples.length}
                </p>
              </div>
              <Music className="w-8 h-8 text-[#00FF88]" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[#2a2a2a]">
          <button
            onClick={() => setActiveTab("applications")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "applications"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Creator Applications ({pendingApplications.length})
          </button>
          <button
            onClick={() => setActiveTab("samples")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "samples"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            <Music className="w-4 h-4 inline mr-2" />
            Sample Moderation ({draftSamples.length})
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`px-4 py-3 font-medium border-b-2 transition ${
              activeTab === "tools"
                ? "border-[#00FF88] text-[#00FF88]"
                : "border-transparent text-[#a1a1a1] hover:text-white"
            }`}
          >
            Admin Tools
          </button>
        </div>

        {/* Content */}
        <div>
          {activeTab === "applications" && (
            <div>
              {pendingApplications.length > 0 ? (
                <div className="space-y-6">
                  {pendingApplications.map((app) => (
                    <CreatorReviewPanel
                      key={app.id}
                      application={app}
                      onReview={handleApplicationReviewed}
                    />
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

          {activeTab === "samples" && (
            <div>
              {draftSamples.length > 0 ? (
                <div className="space-y-6">
                  {draftSamples.map((sample) => (
                    <div key={sample.id} className="relative">
                      <SampleModerationPanel
                        sample={sample}
                        creator={sampleCreators[sample.creator_id]}
                        onModerate={handleSampleModerated}
                      />
                      <Button
                        onClick={() => setEditingSample(sample)}
                        className="absolute top-4 right-4 bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                      >
                        Edit Metadata
                      </Button>
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
                    No samples awaiting moderation.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "tools" && (
            <div className="space-y-6">
              <UserSearchPanel />
              <CSVExport />
            </div>
          )}
        </div>

        {/* Edit Sample Modal */}
        {editingSample && (
          <EditSampleModal
            sample={editingSample}
            open={!!editingSample}
            onClose={() => setEditingSample(null)}
            onSave={handleSampleModerated}
          />
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Eye, Music, Search } from "lucide-react";
import { CreatorStats } from "@/components/creator/CreatorStats";
import { SampleUploadForm } from "@/components/creator/SampleUploadForm";

interface CreatorSample {
  id: string;
  name: string;
  genre: string;
  status: string;
  purchases: number;
  downloads: number;
}

// Mock data
const MOCK_SAMPLES: CreatorSample[] = [
  {
    id: "1",
    name: "Deep House Groove 120 BPM",
    genre: "House",
    status: "published",
    purchases: 12,
    downloads: 45,
  },
  {
    id: "2",
    name: "Trap Hi-Hats Pattern",
    genre: "Trap",
    status: "draft",
    purchases: 0,
    downloads: 0,
  },
  {
    id: "3",
    name: "Lo-Fi Piano Loop",
    genre: "Hip-Hop",
    status: "pending_review",
    purchases: 0,
    downloads: 0,
  },
];

export default function CreatorDashboardPage() {
  const [samples] = useState<CreatorSample[]>(MOCK_SAMPLES);
  const [filteredSamples, setFilteredSamples] = useState<CreatorSample[]>(MOCK_SAMPLES);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    const filtered = samples.filter((s) =>
      s.name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredSamples(filtered);
  };

  const handleUploadSuccess = () => {
    setShowUploadForm(false);
    // TODO: Refresh samples from DB
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Delete this sample? This cannot be undone.")) return;
    // TODO: Replace with Supabase/Prisma call
    console.log("Delete sample:", sampleId);
  };

  const handleSubmitForReview = async (sampleId: string) => {
    // TODO: Replace with Supabase/Prisma call
    alert("Sample submitted for moderation review");
  };

  const totalDownloads = samples.reduce((sum, s) => sum + s.downloads, 0);
  const totalPurchases = samples.reduce((sum, s) => sum + s.purchases, 0);
  const totalEarnings = totalPurchases * 0.03;

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
              - Manage your samples and track earnings
            </p>
          </div>
          <Button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Upload Sample
          </Button>
        </div>

        {/* Stats */}
        <CreatorStats
          totalSamples={samples.length}
          totalDownloads={totalDownloads}
          totalEarnings={totalEarnings}
          totalPurchases={totalPurchases}
        />

        {/* Upload Form */}
        {showUploadForm && (
          <SampleUploadForm
            userId="mock-user"
            onSuccess={handleUploadSuccess}
            onCancel={() => setShowUploadForm(false)}
          />
        )}

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
                      Downloads
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Purchases
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
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#a1a1a1]">{sample.genre}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white">{sample.downloads}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white">{sample.purchases}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            sample.status === "published"
                              ? "bg-[#00FF88]/20 text-[#00FF88]"
                              : sample.status === "pending_review"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-[#2a2a2a] text-[#a1a1a1]"
                          }`}
                        >
                          {sample.status === "pending_review"
                            ? "Pending Review"
                            : sample.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {sample.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSubmitForReview(sample.id)}
                              className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
                            onClick={() =>
                              alert("Edit feature coming soon")
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
              onClick={() => setShowUploadForm(true)}
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

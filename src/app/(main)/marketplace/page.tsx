"use client";

import React, { useState, useEffect } from "react";
import { Search, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SampleCard, Sample } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";

// Mock data for development
const MOCK_SAMPLES: Sample[] = [
  {
    id: "1",
    name: "Deep House Groove 120 BPM",
    creator_id: "c1",
    artist_name: "DJ Phoenix",
    genre: "House",
    key: "C",
    bpm: 120,
    credit_price: 3,
    tags: ["house", "deep", "groove"],
    average_rating: 4.5,
    total_ratings: 12,
    total_purchases: 45,
  },
  {
    id: "2",
    name: "Trap Hi-Hats Pattern",
    creator_id: "c2",
    artist_name: "BeatMaker Pro",
    genre: "Trap",
    key: "F#",
    bpm: 140,
    credit_price: 2,
    tags: ["trap", "hihats", "percussion"],
    average_rating: 4.2,
    total_ratings: 8,
    total_purchases: 32,
  },
  {
    id: "3",
    name: "Ambient Pad Cm7",
    creator_id: "c3",
    artist_name: "SynthWave",
    genre: "Ambient",
    key: "C",
    bpm: 80,
    credit_price: 4,
    tags: ["ambient", "pad", "atmospheric"],
    average_rating: 4.8,
    total_ratings: 20,
    total_purchases: 67,
  },
  {
    id: "4",
    name: "Lo-Fi Piano Loop",
    creator_id: "c1",
    artist_name: "DJ Phoenix",
    genre: "Hip-Hop",
    key: "G",
    bpm: 90,
    credit_price: 3,
    tags: ["lofi", "piano", "chill"],
    average_rating: 4.6,
    total_ratings: 15,
    total_purchases: 51,
  },
  {
    id: "5",
    name: "Techno Kick Drum 808",
    creator_id: "c4",
    artist_name: "Underground Sound",
    genre: "Techno",
    key: "A",
    bpm: 130,
    credit_price: 1,
    tags: ["techno", "kick", "808"],
    average_rating: 4.0,
    total_ratings: 6,
    total_purchases: 28,
  },
];

export default function MarketplacePage() {
  const [samples, setSamples] = useState<Sample[]>(MOCK_SAMPLES);
  const [filteredSamples, setFilteredSamples] = useState<Sample[]>(MOCK_SAMPLES);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    genre: "all",
    sampleType: "all",
    key: "all",
    sortBy: "popular",
  });

  // TODO: Replace with Supabase/Prisma call
  const user = {
    id: "mock-user",
    credits: 150,
    subscription_status: "active",
  };

  const applyFilters = (
    sampleList: Sample[],
    query: string,
    filterObj: typeof filters
  ) => {
    let filtered = [...sampleList];

    if (query.trim()) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.artist_name?.toLowerCase().includes(query.toLowerCase()) ||
          s.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      );
    }

    if (filterObj.genre !== "all") {
      filtered = filtered.filter((s) => s.genre === filterObj.genre);
    }

    if (filterObj.sampleType !== "all") {
      filtered = filtered.filter((s) => s.sample_type === filterObj.sampleType);
    }

    if (filterObj.key !== "all") {
      filtered = filtered.filter((s) => s.key === filterObj.key);
    }

    if (filterObj.sortBy === "popular") {
      filtered.sort(
        (a, b) => (b.total_purchases || 0) - (a.total_purchases || 0)
      );
    } else if (filterObj.sortBy === "newest") {
      filtered.sort(
        (a, b) =>
          new Date(b.created_date || "").getTime() -
          new Date(a.created_date || "").getTime()
      );
    } else if (filterObj.sortBy === "rating") {
      filtered.sort(
        (a, b) => (b.average_rating || 0) - (a.average_rating || 0)
      );
    }

    setFilteredSamples(filtered);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFilters(samples, query, filters);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    applyFilters(samples, searchQuery, newFilters);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#a1a1a1]" />
            <Input
              type="text"
              placeholder="Search samples, creators, genres..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
            />
          </div>
        </div>

        {/* Filters */}
        <SampleFilters onFilterChange={handleFilterChange} />

        {/* Results */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[#a1a1a1] mb-4">
            {filteredSamples.length} samples
          </h2>

          {loading ? (
            <div className="space-y-2">
              {Array(8)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="h-20 bg-[#1a1a1a] rounded-lg animate-pulse"
                  />
                ))}
            </div>
          ) : filteredSamples.length > 0 ? (
            <div className="space-y-2">
              {filteredSamples.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  user={user}
                  onPurchase={() => {}}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
              <p className="text-[#a1a1a1]">
                No samples found matching your filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

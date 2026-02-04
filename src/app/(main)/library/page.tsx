"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SampleCard, Sample } from "@/components/marketplace/SampleCard";
import { SampleFilters } from "@/components/marketplace/SampleFilters";

// Mock purchased samples
const MOCK_PURCHASES: Sample[] = [
  {
    id: "1",
    name: "Deep House Groove 120 BPM",
    creator_id: "c1",
    artist_name: "DJ Phoenix",
    genre: "House",
    key: "C",
    bpm: 120,
    credit_price: 3,
    average_rating: 4.5,
    total_ratings: 12,
  },
];

export default function LibraryPage() {
  const [purchases] = useState<Sample[]>(MOCK_PURCHASES);
  const [filteredPurchases, setFilteredPurchases] = useState<Sample[]>(MOCK_PURCHASES);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading] = useState(false);

  // TODO: Replace with Supabase/Prisma call
  const user = { id: "mock-user", credits: 150 };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const filtered = purchases.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.genre?.toLowerCase().includes(query.toLowerCase()) ||
          s.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      );
      setFilteredPurchases(filtered);
    } else {
      setFilteredPurchases(purchases);
    }
  };

  const handleFilterChange = (newFilters: {
    genre: string;
    sampleType: string;
    key: string;
    sortBy: string;
  }) => {
    let filtered = [...purchases];

    if (newFilters.genre !== "all") {
      filtered = filtered.filter((s) => s.genre === newFilters.genre);
    }
    if (newFilters.sampleType !== "all") {
      filtered = filtered.filter((s) => s.sample_type === newFilters.sampleType);
    }
    if (newFilters.key !== "all") {
      filtered = filtered.filter((s) => s.key === newFilters.key);
    }

    setFilteredPurchases(filtered);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Library</h1>
          <p className="text-[#a1a1a1]">
            {purchases.length} samples purchased
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#a1a1a1]" />
            <Input
              type="text"
              placeholder="Search your library..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <SampleFilters onFilterChange={handleFilterChange} />
        </div>

        {/* Results */}
        {loading ? (
          <div className="h-96 bg-[#1a1a1a] rounded-lg animate-pulse" />
        ) : filteredPurchases.length > 0 ? (
          <div className="space-y-2">
            {filteredPurchases.map((sample) => (
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
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Your library is empty
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Purchase samples from the marketplace to add them to your library.
            </p>
            <Link href="/marketplace">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
                Browse Marketplace
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

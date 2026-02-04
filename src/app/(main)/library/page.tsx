"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Music, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

interface LibrarySample {
  id: string;
  name: string;
  slug: string;
  creator_id: string;
  artist_name: string;
  genre: string;
  instrument_type: string;
  sample_type: string;
  key: string | null;
  bpm: number | null;
  credit_price: number;
  tags: string[];
  file_url: string;
  preview_url: string | null;
  cover_image_url: string | null;
  average_rating: number;
  total_ratings: number;
  purchased_at: string;
}

export default function LibraryPage() {
  const { user, loading: userLoading } = useUser();
  const [samples, setSamples] = useState<LibrarySample[]>([]);
  const [filtered, setFiltered] = useState<LibrarySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;

    fetch("/api/library")
      .then((res) => res.json())
      .then((data) => {
        if (data.samples) {
          setSamples(data.samples);
          setFiltered(data.samples);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setFiltered(
        samples.filter(
          (s) =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.artist_name?.toLowerCase().includes(query.toLowerCase()) ||
            s.genre?.toLowerCase().includes(query.toLowerCase()) ||
            s.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
        )
      );
    } else {
      setFiltered(samples);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Library</h1>
          <p className="text-[#a1a1a1]">
            {samples.length} sample{samples.length !== 1 ? "s" : ""} purchased
          </p>
        </div>

        {samples.length > 0 && (
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
        )}

        {filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map((sample) => (
              <div
                key={sample.id}
                className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00FF88]/50 transition-all p-4 flex items-center gap-4"
              >
                {/* Cover */}
                <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
                  <img
                    src={
                      sample.cover_image_url ||
                      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop"
                    }
                    alt={sample.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate text-sm">
                    {sample.name}
                  </h3>
                  <p className="text-xs text-[#a1a1a1]">
                    {sample.artist_name}
                  </p>
                </div>

                {/* Metadata */}
                <div className="hidden md:flex items-center gap-4 text-xs text-[#a1a1a1]">
                  <span>{sample.genre}</span>
                  {sample.key && <span>{sample.key}</span>}
                  {sample.bpm && <span>{sample.bpm} BPM</span>}
                </div>

                {/* Purchased date */}
                <div className="hidden lg:block text-xs text-[#666]">
                  {new Date(sample.purchased_at).toLocaleDateString()}
                </div>

                {/* Download */}
                <DownloadButton sampleId={sample.id} />
              </div>
            ))}
          </div>
        ) : samples.length > 0 ? (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
            <p className="text-[#a1a1a1]">No samples match your search.</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Your library is empty
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Purchase samples from the marketplace to add them here.
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

function DownloadButton({ sampleId }: { sampleId: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/downloads/${sampleId}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Download failed");
      }

      // Get the filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || "sample.wav";

      // Create blob and trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download sample.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      size="sm"
      className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-medium h-8 px-4"
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5 mr-1" />
      )}
      Download
    </Button>
  );
}

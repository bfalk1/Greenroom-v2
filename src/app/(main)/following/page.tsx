"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Music, Loader2, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleCard, Sample } from "@/components/marketplace/SampleCard";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const PAGE_SIZE = 20;

export default function FollowingPage() {
  const { user, refreshUser } = useUser();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [total, setTotal] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  const fetchSamples = useCallback(
    async (offset = 0, append = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (offset === 0) setLoading(true);
        else setLoadingMore(true);

        const res = await fetch(
          `/api/samples/following?limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (!res.ok) throw new Error("Failed to fetch samples");

        const data = await res.json();

        if (append) {
          setSamples((prev) => [...prev, ...data.samples]);
        } else {
          setSamples(data.samples || []);
        }
        setTotal(data.total || 0);
        setFollowingCount(data.following || 0);
      } catch (error) {
        console.error("Error fetching samples:", error);
        toast.error("Failed to load samples");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user]
  );

  const fetchPurchases = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/purchases");
      if (res.ok) {
        const data = await res.json();
        setPurchasedIds(new Set(data.sampleIds));
      }
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    fetchSamples(0, false);
  }, [fetchSamples]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleLoadMore = () => {
    fetchSamples(samples.length, true);
  };

  const handlePurchase = async (sample: Sample) => {
    if (!user) {
      toast.error("Please log in to purchase samples");
      return;
    }

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Purchase failed");
      }

      setPurchasedIds((prev) => new Set([...prev, sample.id]));
      refreshUser();
      toast.success(`Purchased "${sample.name}" 🎵`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase failed";
      toast.error(message);
    }
  };

  const userForCard = user
    ? {
        id: user.id,
        email: user.email,
        credits: user.credits,
        subscription_status: user.subscription_status,
        is_creator: user.is_creator,
        role: user.role,
      }
    : null;

  // Not logged in
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <Users className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Sign In Required</h1>
            <p className="text-[#a1a1a1] mb-6">
              Log in to see samples from artists you follow.
            </p>
            <Link href="/login">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/marketplace">
            <Button
              variant="ghost"
              className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] mb-4 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#00FF88]/10 rounded-lg">
              <Users className="w-6 h-6 text-[#00FF88]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Following</h1>
              <p className="text-[#a1a1a1]">
                {followingCount > 0
                  ? `Samples from ${followingCount} artist${followingCount !== 1 ? "s" : ""} you follow`
                  : "Follow artists to see their samples here"}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
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
        ) : samples.length > 0 ? (
          <div className="space-y-2">
            {samples.map((sample) => (
              <SampleCard
                key={sample.id}
                sample={sample}
                user={userForCard}
                isOwned={purchasedIds.has(sample.id)}
                onPurchase={handlePurchase}
              />
            ))}

            {/* Load More */}
            {samples.length < total && (
              <div className="flex justify-center pt-6">
                <Button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  variant="outline"
                  className="border-[#2a2a2a] text-white hover:bg-[#1a1a1a] px-8"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${samples.length} of ${total})`
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : followingCount === 0 ? (
          <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
            <Users className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">No Artists Followed</h2>
            <p className="text-[#a1a1a1] mb-6 max-w-md mx-auto">
              Explore the marketplace and follow your favorite artists to see their latest samples here.
            </p>
            <Link href="/marketplace">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
                Explore Marketplace
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
            <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">No Samples Yet</h2>
            <p className="text-[#a1a1a1]">
              The artists you follow haven&apos;t uploaded any samples yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

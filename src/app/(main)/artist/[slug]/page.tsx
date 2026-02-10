"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { 
  Music, 
  Users, 
  Download, 
  Calendar, 
  Loader2, 
  UserPlus, 
  UserMinus,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleCard, Sample } from "@/components/marketplace/SampleCard";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

interface Artist {
  id: string;
  username: string | null;
  artist_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  social_links: Record<string, string> | null;
  created_at: string;
  sample_count: number;
  follower_count: number;
  total_downloads: number;
  is_following: boolean;
}

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export default function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = use(params);
  const { user, refreshUser } = useUser();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  const fetchArtist = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/artist/${slug}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          setArtist(null);
          setSamples([]);
          return;
        }
        throw new Error("Failed to fetch artist");
      }

      const data = await res.json();
      setArtist(data.artist);
      setSamples(data.samples);
    } catch (error) {
      console.error("Error fetching artist:", error);
      toast.error("Failed to load artist profile");
    } finally {
      setLoading(false);
    }
  }, [slug]);

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
    fetchArtist();
  }, [fetchArtist]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleFollow = async () => {
    if (!user) {
      toast.error("Please log in to follow artists");
      return;
    }

    if (!artist) return;

    setFollowLoading(true);
    try {
      const res = await fetch(`/api/artist/${slug}/follow`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update follow");
      }

      const data = await res.json();
      setArtist({
        ...artist,
        is_following: data.following,
        follower_count: data.follower_count,
      });

      toast.success(
        data.following
          ? `Following ${artist.artist_name}`
          : `Unfollowed ${artist.artist_name}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update follow";
      toast.error(message);
    } finally {
      setFollowLoading(false);
    }
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const getSocialIcon = (platform: string) => {
    return <ExternalLink className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Artist Not Found</h1>
            <p className="text-[#a1a1a1] mb-6">
              The artist you&apos;re looking for doesn&apos;t exist or isn&apos;t available.
            </p>
            <Link href="/marketplace">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 lg:h-80 overflow-hidden">
        {artist.banner_url ? (
          <img
            src={artist.banner_url}
            alt={`${artist.artist_name} banner`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#00FF88]/20 via-[#1a1a1a] to-[#2a2a2a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent" />
      </div>

      {/* Profile Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-20 sm:-mt-24 lg:-mt-32 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-full border-4 border-[#0a0a0a] overflow-hidden bg-[#1a1a1a]">
                {artist.avatar_url ? (
                  <img
                    src={artist.avatar_url}
                    alt={artist.artist_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00FF88]/20 to-[#2a2a2a]">
                    <Music className="w-12 h-12 sm:w-16 sm:h-16 text-[#00FF88]" />
                  </div>
                )}
              </div>
            </div>

            {/* Name & Actions */}
            <div className="flex-1 pb-2">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2">
                {artist.artist_name}
              </h1>
              {artist.username && artist.username !== artist.artist_name && (
                <p className="text-[#a1a1a1] mb-4">@{artist.username}</p>
              )}
              
              {/* Stats Row */}
              <div className="flex flex-wrap gap-4 sm:gap-6 text-sm mb-4">
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Music className="w-4 h-4 text-[#00FF88]" />
                  <span className="font-semibold text-white">{artist.sample_count}</span>
                  <span>samples</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Users className="w-4 h-4 text-[#00FF88]" />
                  <span className="font-semibold text-white">{artist.follower_count}</span>
                  <span>followers</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Download className="w-4 h-4 text-[#00FF88]" />
                  <span className="font-semibold text-white">{artist.total_downloads}</span>
                  <span>downloads</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Calendar className="w-4 h-4 text-[#00FF88]" />
                  <span>Joined {formatDate(artist.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Follow Button */}
            {user?.id !== artist.id && (
              <div className="sm:pb-2">
                <Button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`min-w-[120px] ${
                    artist.is_following
                      ? "bg-[#1a1a1a] text-white border border-[#2a2a2a] hover:bg-[#2a2a2a] hover:border-red-500/50 hover:text-red-400"
                      : "bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                  }`}
                >
                  {followLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : artist.is_following ? (
                    <>
                      <UserMinus className="w-4 h-4 mr-2" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bio & Social Links */}
        {(artist.bio || artist.social_links) && (
          <div className="mb-8 pb-8 border-b border-[#2a2a2a]">
            {artist.bio && (
              <p className="text-[#a1a1a1] text-lg mb-4 max-w-3xl whitespace-pre-line">
                {artist.bio}
              </p>
            )}
            {artist.social_links && Object.keys(artist.social_links).length > 0 && (
              <div className="flex flex-wrap gap-3">
                {Object.entries(artist.social_links).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-[#a1a1a1] hover:text-white hover:border-[#00FF88]/50 transition-colors"
                  >
                    {getSocialIcon(platform)}
                    <span className="capitalize">{platform}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Samples */}
        <div className="pb-16">
          <h2 className="text-xl font-semibold text-white mb-6">
            Samples ({samples.length})
          </h2>

          {samples.length > 0 ? (
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
            </div>
          ) : (
            <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
              <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
              <p className="text-[#a1a1a1]">
                {artist.artist_name} hasn&apos;t uploaded any samples yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

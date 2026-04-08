"use client";

import React, { useState, useEffect, useCallback, use, useRef } from "react";
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
import { Sample } from "@/components/marketplace/SampleCard";
import { SampleRow, SampleTableHeader } from "@/components/marketplace/SampleRow";
import { useUser } from "@/lib/hooks/useUser";
import { trackArtistFollow, trackArtistProfileViewed } from "@/lib/analytics";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  const PAGE_SIZE = 20;

  const dedupeSamples = useCallback((items: Sample[]) => {
    const seenIds = new Set<string>();
    return items.filter((sample) => {
      if (seenIds.has(sample.id)) {
        return false;
      }
      seenIds.add(sample.id);
      return true;
    });
  }, []);

  const fetchArtist = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/artist/${slug}?offset=0&limit=${PAGE_SIZE}`);
      
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
      trackArtistProfileViewed(slug);
      setSamples(dedupeSamples(data.samples || []));
      setHasMore(data.hasMore ?? false);
    } catch (error) {
      console.error("Error fetching artist:", error);
      toast.error("Failed to load artist profile");
    } finally {
      setLoading(false);
    }
  }, [dedupeSamples, slug]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    try {
      setLoadingMore(true);
      const res = await fetch(`/api/artist/${slug}?offset=${samples.length}&limit=${PAGE_SIZE}`);
      
      if (!res.ok) throw new Error("Failed to load more samples");
      
      const data = await res.json();
      const incomingSamples = data.samples || [];
      setHasMore(
        incomingSamples.length < PAGE_SIZE ? false : (data.hasMore ?? false)
      );
      setSamples((prev) => dedupeSamples([...prev, ...incomingSamples]));
    } catch (error) {
      console.error("Error loading more samples:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [dedupeSamples, slug, samples.length, loadingMore, hasMore]);

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

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

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
      trackArtistFollow(artist.id, data.following);

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
    switch (platform.toLowerCase()) {
      case "soundcloud":
        return (
          <svg className="w-6 h-6" viewBox="-2 6 20 12" fill="currentColor">
            <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.084-.1zm-.899 1.2c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.054-.094-.099-.094zm1.83-.663c-.074 0-.12.046-.127.12l-.214 2.096.214 2.035c.007.074.053.12.127.12.073 0 .12-.046.127-.12l.241-2.035-.241-2.096c-.007-.074-.054-.12-.127-.12zm.945-.357c-.089 0-.149.06-.149.149l-.193 2.453.193 2.378c0 .089.06.149.149.149.09 0 .15-.06.15-.149l.22-2.378-.22-2.453c0-.089-.06-.149-.15-.149zm.959-.164c-.104 0-.164.06-.164.164l-.178 2.617.178 2.497c0 .104.06.164.164.164.104 0 .165-.06.165-.164l.198-2.497-.198-2.617c0-.104-.061-.164-.165-.164zm1.014-.127c-.118 0-.179.06-.179.179l-.164 2.744.164 2.565c0 .118.061.178.179.178s.179-.06.179-.178l.186-2.565-.186-2.744c0-.119-.061-.179-.179-.179zm.987-.045c-.132 0-.194.06-.194.194l-.149 2.789.149 2.617c0 .133.062.194.194.194.133 0 .194-.061.194-.194l.164-2.617-.164-2.789c0-.134-.061-.194-.194-.194zm1.017.075c-.147 0-.209.074-.209.209l-.134 2.714.134 2.565c0 .135.062.21.209.21.147 0 .208-.075.208-.21l.149-2.565-.149-2.714c0-.135-.061-.209-.208-.209zm3.478 1.363c-.298 0-.581.053-.842.158-.178-2.024-1.88-3.615-3.967-3.615-.521 0-1.028.101-1.491.283-.194.075-.246.15-.246.3v7.236c0 .15.11.279.256.294h6.29c1.323 0 2.396-1.073 2.396-2.396s-1.073-2.26-2.396-2.26z"/>
          </svg>
        );
      case "spotify":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        );
      case "instagram":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
        );
      case "linkedin":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        );
      case "tiktok":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
        );
      case "x":
      case "twitter":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        );
      case "youtube":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case "apple_music":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.99c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.364-1.29.443-2.25 1.25-2.864 2.503a6.238 6.238 0 00-.477 2.06 9.37 9.37 0 00-.006.9v10.16c.01.15.017.3.026.45a10.092 10.092 0 00.346 2.12c.44 1.327 1.265 2.313 2.54 2.932a5.574 5.574 0 001.97.58c.375.047.752.072 1.13.08.21.005.42.01.63.01h10.45c.15-.008.3-.015.45-.026a10.36 10.36 0 002.12-.36c1.3-.424 2.273-1.22 2.895-2.47.38-.76.58-1.573.64-2.42.01-.15.02-.3.02-.45V6.42c-.005-.1-.008-.2-.016-.296zM11.97 14.89c0 1.166-.002 2.333.002 3.5 0 .13-.014.26-.032.39-.057.41-.267.68-.628.85-.28.13-.587.18-.893.1-.326-.09-.565-.305-.687-.62-.063-.16-.1-.337-.1-.51-.005-.792-.002-1.584-.002-2.376v-.31h-.005c0-.46-.005-.92.002-1.38.01-.63.49-1.14 1.14-1.22.54-.066 1.037.21 1.256.7.084.19.12.385.12.585-.005.49-.002.98-.002 1.47l-.002-.003zm0-5.27c.002.86-.675 1.58-1.55 1.59-.855.01-1.563-.71-1.573-1.55-.01-.87.68-1.59 1.55-1.6.86-.01 1.57.68 1.58 1.56h-.007z"/>
          </svg>
        );
      default:
        return <ExternalLink className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
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
              <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
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
          <div className="w-full h-full bg-gradient-to-br from-[#39b54a]/20 via-[#1a1a1a] to-[#2a2a2a]" />
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
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#39b54a]/20 to-[#2a2a2a]">
                    <Music className="w-12 h-12 sm:w-16 sm:h-16 text-[#39b54a]" />
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
                  <Music className="w-4 h-4 text-[#39b54a]" />
                  <span className="font-semibold text-white">{artist.sample_count}</span>
                  <span>samples</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Users className="w-4 h-4 text-[#39b54a]" />
                  <span className="font-semibold text-white">{artist.follower_count}</span>
                  <span>followers</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Download className="w-4 h-4 text-[#39b54a]" />
                  <span className="font-semibold text-white">{artist.total_downloads}</span>
                  <span>downloads</span>
                </div>
                <div className="flex items-center gap-2 text-[#a1a1a1]">
                  <Calendar className="w-4 h-4 text-[#39b54a]" />
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
                      : "bg-[#39b54a] text-black hover:bg-[#2e9140]"
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
                {Object.entries(artist.social_links)
                  .filter(([platform]) => platform !== "website")
                  .map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#39b54a] hover:bg-[#39b54a]/10 hover:border-[#39b54a]/50 transition-colors"
                    title={platform}
                  >
                    {getSocialIcon(platform)}
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
            <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
              {/* Table Header */}
              <SampleTableHeader />

              {/* Table Body */}
              <div className="divide-y divide-[#2a2a2a]">
                {samples.map((sample) => (
                  <SampleRow
                    key={sample.id}
                    sample={sample}
                    user={userForCard}
                    isOwned={purchasedIds.has(sample.id)}
                    showArtist={false}
                    onPurchase={handlePurchase}
                    refreshUser={refreshUser}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-6 border-t border-[#2a2a2a]">
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-[#a1a1a1]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading more...
                    </div>
                  ) : (
                    <span className="text-[#3a3a3a] text-sm">{samples.length} samples</span>
                  )}
                </div>
              )}
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

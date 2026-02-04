"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Play, Pause, Download, Heart, Star, User, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleRating } from "./SampleRating";

export interface Sample {
  id: string;
  name: string;
  creator_id: string;
  artist_name?: string;
  genre: string;
  instrument_type?: string;
  sample_type?: string;
  key?: string;
  bpm?: number;
  tags?: string[];
  credit_price: number;
  file_url?: string;
  cover_art_url?: string;
  status?: string;
  average_rating?: number;
  total_ratings?: number;
  total_purchases?: number;
  total_downloads?: number;
  created_date?: string;
}

export interface UserType {
  id: string;
  email?: string;
  credits?: number;
  subscription_status?: string;
  is_creator?: boolean;
  role?: string;
}

interface SampleCardProps {
  sample: Sample;
  user: UserType | null;
  onPurchase?: (sample: Sample) => void;
}

export function SampleCard({ sample, user, onPurchase }: SampleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isOwned, setIsOwned] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handlePurchase = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please log in to purchase samples.");
      return;
    }

    setIsPurchasing(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onPurchase?.(sample);
      setIsOwned(true);
      alert("Sample purchased successfully!");
    } catch {
      alert("Purchase failed. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div>
      <audio ref={audioRef} src={sample.file_url} />
      <div
        className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00FF88]/50 transition-all duration-300 flex items-center p-3 gap-4"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Cover Art */}
        <div className="relative w-16 h-16 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
          <img
            src={
              sample.cover_art_url ||
              "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop"
            }
            alt={sample.name}
            className="w-full h-full object-cover"
          />

          {/* Play Button Overlay */}
          {isHovered && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Button
                size="sm"
                className="rounded-full bg-[#00FF88] text-black hover:bg-[#00cc6a] w-8 h-8 p-0 flex items-center justify-center"
                onClick={(e) => {
                  e.preventDefault();
                  setIsPlaying(!isPlaying);
                }}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate text-sm mb-1">
            {sample.name}
          </h3>
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-[#a1a1a1]" />
            <Link
              href={`/creator/profile?id=${sample.creator_id}`}
              className="text-xs text-[#a1a1a1] hover:text-[#00FF88] truncate transition"
            >
              {sample.artist_name || "Unknown Creator"}
            </Link>
          </div>
        </div>

        {/* Metadata */}
        <div className="hidden md:flex items-center gap-6 text-xs text-[#a1a1a1]">
          <div className="flex items-center gap-1">
            <span className="font-medium">{sample.genre}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{sample.key}</span>
          </div>
          {sample.bpm && (
            <div className="flex items-center gap-1">
              <span>{sample.bpm} BPM</span>
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="hidden lg:block">
          <SampleRating sample={sample} user={user} />
        </div>

        {/* Price & Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="bg-[#00FF88]/10 text-[#00FF88] px-3 py-1 rounded-full text-xs font-bold">
            {sample.credit_price} credits
          </div>
          <Button
            onClick={handlePurchase}
            disabled={isPurchasing || isOwned}
            className={`text-sm font-medium h-8 px-4 ${
              isOwned
                ? "bg-[#1a1a1a] text-[#00FF88] border border-[#00FF88]/30 hover:bg-[#1a1a1a]"
                : "bg-[#00FF88] text-black hover:bg-[#00cc6a] disabled:opacity-50"
            }`}
          >
            {isOwned ? (
              <Check className="w-3.5 h-3.5 mr-1" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1" />
            )}
            {isPurchasing ? "Purchasing..." : isOwned ? "Owned" : "Get"}
          </Button>
          <Button
            variant="ghost"
            className="px-2 h-8 hover:bg-[#2a2a2a]"
            onClick={(e) => e.preventDefault()}
          >
            <Heart className="w-4 h-4 text-[#a1a1a1]" />
          </Button>
        </div>
      </div>
    </div>
  );
}

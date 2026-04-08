"use client";

import React, { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { trackSampleRate } from "@/lib/analytics";
import { toast } from "sonner";
import type { Sample, UserType } from "./SampleCard";

interface SampleRatingProps {
  sample: Sample;
  user: UserType | null;
  isOwned?: boolean;
  initialRating?: number;
  compact?: boolean;
  onRatingChange?: (sampleId: string, score: number, stats: { average: number; count: number }) => void;
}

export function SampleRating({ 
  sample, 
  user, 
  isOwned = false,
  initialRating,
  compact = false,
  onRatingChange,
}: SampleRatingProps) {
  const [userRating, setUserRating] = useState(initialRating || 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [averageRating, setAverageRating] = useState(sample.average_rating || 0);
  const [ratingCount, setRatingCount] = useState(sample.total_ratings || 0);

  useEffect(() => {
    if (initialRating !== undefined) {
      setUserRating(initialRating);
    }
  }, [initialRating]);

  useEffect(() => {
    setAverageRating(sample.average_rating || 0);
    setRatingCount(sample.total_ratings || 0);
  }, [sample.average_rating, sample.total_ratings]);

  const canRate = user && isOwned;

  const handleRate = async (rating: number) => {
    if (!user) {
      toast.error("Please log in to rate samples");
      return;
    }

    if (!isOwned) {
      toast.error("Purchase this sample to rate it");
      return;
    }

    if (submitting) return;

    try {
      setSubmitting(true);
      
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleId: sample.id, score: rating }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit rating");
      }

      setUserRating(rating);
      setAverageRating(data.sampleStats.average);
      setRatingCount(data.sampleStats.count);
      trackSampleRate(sample.id, rating);
      onRatingChange?.(sample.id, rating, data.sampleStats);
      
      toast.success(`Rated ${rating} star${rating !== 1 ? "s" : ""} ⭐`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit rating";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Display rating (user's rating when rated, or average when not)
  const displayRating = userRating || 0;
  const showingUserRating = userRating > 0;

  // Compact mode for inline display
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= (hoveredRating || displayRating);
          const isUserRated = showingUserRating && star <= userRating && !hoveredRating;
          
          return (
            <button
              key={star}
              disabled={!canRate || submitting}
              onMouseEnter={() => canRate && setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => handleRate(star)}
              className={`transition-transform ${
                canRate ? "hover:scale-110 cursor-pointer" : "cursor-default"
              } disabled:cursor-not-allowed`}
              title={canRate ? `Rate ${star} star${star !== 1 ? "s" : ""}` : ""}
            >
              <Star
                className={`w-3 h-3 transition-colors ${
                  isActive
                    ? isUserRated
                      ? "fill-[#FFD700] text-[#FFD700]"
                      : "fill-[#39b54a] text-[#39b54a]"
                    : "text-[#3a3a3a]"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isActive = star <= (hoveredRating || displayRating);
        const isUserRated = showingUserRating && star <= userRating && !hoveredRating;
        
        return (
          <button
            key={star}
            disabled={!canRate || submitting}
            onMouseEnter={() => canRate && setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            onClick={() => handleRate(star)}
            className={`transition-transform ${
              canRate ? "hover:scale-110 cursor-pointer" : "cursor-default"
            } disabled:cursor-not-allowed`}
            title={canRate ? `Rate ${star} star${star !== 1 ? "s" : ""}` : (isOwned ? "" : "Purchase to rate")}
          >
            <Star
              className={`w-4 h-4 transition-colors ${
                isActive
                  ? isUserRated
                    ? "fill-[#FFD700] text-[#FFD700]" // Gold for user's rating
                    : "fill-[#39b54a] text-[#39b54a]" // Green on hover
                  : "text-[#3a3a3a]"
              }`}
            />
          </button>
        );
      })}
      <span className="text-xs text-[#a1a1a1] ml-2">
        {averageRating.toFixed(1)} ({ratingCount})
      </span>
    </div>
  );
}

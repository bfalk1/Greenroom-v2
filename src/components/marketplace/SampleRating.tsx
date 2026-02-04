"use client";

import React, { useState } from "react";
import { Star } from "lucide-react";
import type { Sample, UserType } from "./SampleCard";

interface SampleRatingProps {
  sample: Sample;
  user: UserType | null;
}

export function SampleRating({ sample, user }: SampleRatingProps) {
  const [userRating, setUserRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleRate = async (rating: number) => {
    if (!user || submitting) return;

    try {
      setSubmitting(true);
      // TODO: Replace with Supabase/Prisma call
      setUserRating(rating);
    } catch (error) {
      console.error("Error rating sample:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={!user || submitting}
          onMouseEnter={() => setHoveredRating(star)}
          onMouseLeave={() => setHoveredRating(0)}
          onClick={() => handleRate(star)}
          className="transition-transform hover:scale-110 disabled:cursor-not-allowed"
        >
          <Star
            className={`w-4 h-4 ${
              star <= (hoveredRating || userRating)
                ? "fill-[#00FF88] text-[#00FF88]"
                : "text-[#3a3a3a]"
            }`}
          />
        </button>
      ))}
      <span className="text-xs text-[#a1a1a1] ml-2">
        {sample.average_rating ? sample.average_rating.toFixed(1) : "0.0"} (
        {sample.total_ratings || 0})
      </span>
    </div>
  );
}

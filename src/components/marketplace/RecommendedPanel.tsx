"use client";

import React from "react";
import { Music, RefreshCw, ShoppingBag } from "lucide-react";
import { Sample } from "@/components/marketplace/SampleCard";
import { SampleRow } from "@/components/marketplace/SampleRow";
import { PresetRow, Preset } from "@/components/marketplace/PresetRow";

export interface Recommendations {
  cold: boolean;
  /** Too little purchase history to personalise well yet, so the tab asks for more. */
  needsMoreHistory: boolean;
  signals: {
    purchasedSamples: number;
    purchasedPresets: number;
    favorites: number;
  };
  // `reason` is absent when nothing personal put an item in the list — e.g. a
  // filter narrowed the pool past everything the user's history speaks to.
  samples: Array<Sample & { reason?: string }>;
  presets: Array<Preset & { reason?: string }>;
  /** The served list's id, for attributing buys and likes. Null when it wasn't logged. */
  impressionId: string | null;
}

interface RecommendedPanelProps {
  data: Recommendations | null;
  loading: boolean;
  /** Whether the shared filter bar is narrowing the list (changes the empty state). */
  isFiltered: boolean;
  user: { id: string; email?: string; credits?: number; subscription_status?: string; is_creator?: boolean; role?: string } | null;
  purchasedIds: Set<string>;
  favoritedIds: Set<string>;
  userRatings: Record<string, number>;
  purchasedPresetIds: Set<string>;
  favoritedPresetIds: Set<string>;
  userPresetRatings: Record<string, number>;
  onPurchase: (sample: Sample) => void;
  onFavoriteChange: (sampleId: string, favorited: boolean) => void;
  onPresetPurchase: (preset: Preset) => void;
  onPresetFavoriteChange: (presetId: string, favorited: boolean) => void;
  onRefresh: () => void;
  refreshUser: () => void;
}

export function RecommendedPanel({
  data,
  loading,
  isFiltered,
  user,
  purchasedIds,
  favoritedIds,
  userRatings,
  purchasedPresetIds,
  favoritedPresetIds,
  userPresetRatings,
  onPurchase,
  onFavoriteChange,
  onPresetPurchase,
  onPresetFavoriteChange,
  onRefresh,
  refreshUser,
}: RecommendedPanelProps) {
  const showSkeleton = loading || !data;

  let heading = "Picked for you";
  let basis = "";
  if (data) {
    const count = data.samples.length;
    heading = data.cold
      ? "Popular picks"
      : `${count} sample${count !== 1 ? "s" : ""} picked for you`;
    const purchases = data.signals.purchasedSamples + data.signals.purchasedPresets;
    const favorites = data.signals.favorites;
    if (!data.cold) {
      basis =
        `Based on your ${purchases} purchase${purchases !== 1 ? "s" : ""}` +
        (favorites > 0 ? `, ${favorites} favorite${favorites !== 1 ? "s" : ""},` : "") +
        " and what buyers with similar taste bought.";
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#a1a1a1]">{heading}</h2>
          {basis && <p className="text-xs text-[#666] truncate">{basis}</p>}
          {data?.needsMoreHistory && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#a1a1a1]">
              <ShoppingBag className="w-3.5 h-3.5 flex-shrink-0 text-[#39b54a]" aria-hidden="true" />
              Buy more samples to let us figure out what you like.
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#a1a1a1] hover:text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#39b54a]/50 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Recompute recommendations"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {showSkeleton ? (
        <div className="space-y-2">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse" />
            ))}
        </div>
      ) : data.samples.length > 0 ? (
        <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_1fr_90px_45px_45px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
            <div className="w-10" />
            <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
            <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
            <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Key</span>
            <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">BPM</span>
            <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">&#9733;</span>
            <div />
          </div>
          <div className="divide-y divide-[#2a2a2a]">
            {data.samples.map((sample) => (
              <SampleRow
                key={sample.id}
                sample={sample}
                user={user}
                isOwned={purchasedIds.has(sample.id)}
                isFavorited={favoritedIds.has(sample.id)}
                userRating={userRatings[sample.id]}
                reason={sample.reason}
                recommendationImpressionId={data.impressionId}
                onPurchase={onPurchase}
                onFavoriteChange={onFavoriteChange}
                refreshUser={refreshUser}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
          <p className="text-[#a1a1a1]">
            {isFiltered
              ? "No recommendations match your filters."
              : "Nothing to recommend yet — buy or favorite a few samples first."}
          </p>
        </div>
      )}

      {!showSkeleton && data.presets.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-[#a1a1a1] mt-8 mb-4">
            {data.cold ? "Popular presets" : "Presets picked for you"}
          </h3>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_80px_60px] md:grid-cols-[auto_80px_1fr_80px_90px_80px_50px] gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]">
              <div className="w-10" />
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Synth</span>
              <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Category</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
              <span className="hidden md:block text-xs font-medium text-[#a1a1a1] text-center">&#9733;</span>
              <div />
            </div>
            <div className="divide-y divide-[#2a2a2a]">
              {data.presets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  user={user}
                  isOwned={purchasedPresetIds.has(preset.id)}
                  isFavorited={favoritedPresetIds.has(preset.id)}
                  userRating={userPresetRatings[preset.id]}
                  reason={preset.reason}
                  recommendationImpressionId={data.impressionId}
                  onPurchase={onPresetPurchase}
                  onFavoriteChange={onPresetFavoriteChange}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

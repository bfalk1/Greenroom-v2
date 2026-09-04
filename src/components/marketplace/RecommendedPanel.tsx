"use client";

import React from "react";
import { Sparkles, Music, Sliders, RefreshCw } from "lucide-react";
import { Sample } from "@/components/marketplace/SampleCard";
import { SampleRow } from "@/components/marketplace/SampleRow";
import { PresetRow, Preset } from "@/components/marketplace/PresetRow";

export interface FacetSuggestion {
  value: string;
  label: string;
  available: number;
  buyers: number;
  owned: boolean;
  reason: string;
}

export interface Recommendations {
  cold: boolean;
  signals: {
    purchasedSamples: number;
    purchasedPresets: number;
    favorites: number;
  };
  samples: Array<Sample & { reason: string }>;
  presets: Array<Preset & { reason: string }>;
  genres: FacetSuggestion[];
  instrumentTypes: FacetSuggestion[];
  presetCategories: FacetSuggestion[];
  presetSynths: FacetSuggestion[];
}

interface RecommendedPanelProps {
  data: Recommendations | null;
  loading: boolean;
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
  onGenreSelect: (genre: string) => void;
  onInstrumentSelect: (instrumentType: string) => void;
  onPresetCategorySelect: (category: string) => void;
  onRefresh: () => void;
  refreshUser: () => void;
}

function SuggestionRow({
  title,
  hint,
  items,
  onSelect,
}: {
  title: string;
  hint: string;
  items: FacetSuggestion[];
  onSelect: (value: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 mb-2">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <span className="text-[11px] text-[#666]">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => onSelect(item.value)}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#39b54a]/60 hover:bg-[#202020] transition"
            title={`${item.available} available`}
          >
            <span className="text-xs font-medium text-white group-hover:text-[#39b54a] transition-colors">
              {item.label}
            </span>
            <span className="text-[10px] text-[#666]">{item.reason}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecommendedPanel({
  data,
  loading,
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
  onGenreSelect,
  onInstrumentSelect,
  onPresetCategorySelect,
  onRefresh,
  refreshUser,
}: RecommendedPanelProps) {
  if (loading || !data) {
    return (
      <div className="mb-8 space-y-3">
        <div className="h-20 bg-[#1a1a1a] rounded-lg animate-pulse" />
        {Array(8)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse" />
          ))}
      </div>
    );
  }

  const { signals } = data;
  const purchases = signals.purchasedSamples + signals.purchasedPresets;
  const basis = data.cold
    ? "Buy or favorite a few sounds and this tab starts tracking your taste."
    : `Built from your ${purchases} purchase${purchases !== 1 ? "s" : ""}` +
      (signals.favorites > 0
        ? `, ${signals.favorites} favorite${signals.favorites !== 1 ? "s" : ""},`
        : "") +
      " and what buyers with similar taste bought.";

  return (
    <div className="mb-8">
      <div className="mb-6 p-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#39b54a]/10 rounded-lg">
              <Sparkles className="w-5 h-5 text-[#39b54a]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {data.cold ? "Start here" : "Recommended for you"}
              </h2>
              <p className="text-xs text-[#a1a1a1]">{basis}</p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#a1a1a1] hover:text-white bg-[#141414] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#39b54a]/50 rounded-md transition"
            title="Recompute recommendations"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <SuggestionRow
          title="Genres for you"
          hint="jumps to Samples with the filter applied"
          items={data.genres}
          onSelect={onGenreSelect}
        />
        <SuggestionRow
          title="Sub-categories for you"
          hint="instrument types worth digging into"
          items={data.instrumentTypes}
          onSelect={onInstrumentSelect}
        />
        <SuggestionRow
          title="Preset categories for you"
          hint="jumps to Presets with the filter applied"
          items={data.presetCategories}
          onSelect={onPresetCategorySelect}
        />
      </div>

      <h3 className="text-sm font-semibold text-[#a1a1a1] mb-4">
        {data.cold ? "Popular picks" : "Samples picked for you"}
      </h3>

      {data.samples.length > 0 ? (
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
                onPurchase={onPurchase}
                onFavoriteChange={onFavoriteChange}
                refreshUser={refreshUser}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
          <Music className="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" />
          <p className="text-[#a1a1a1] text-sm">
            Nothing to recommend yet — buy or favorite a few samples first.
          </p>
        </div>
      )}

      {data.presets.length > 0 && (
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
                  onPurchase={onPresetPurchase}
                  onFavoriteChange={onPresetFavoriteChange}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {data.presets.length === 0 && data.presetSynths.length > 0 && (
        <p className="mt-6 text-xs text-[#666]">
          <Sliders className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
          No preset picks yet — try the Presets tab.
        </p>
      )}
    </div>
  );
}

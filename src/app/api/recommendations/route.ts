import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSamplesByIds, loadPresetsByIds, CATEGORY_DISPLAY_NAMES, SYNTH_DISPLAY_NAMES } from "@/lib/marketplaceItems";
import {
  getRecommendationSignals,
  getSampleCandidates,
  getPresetCandidates,
  getSampleFacetSuggestions,
  getPresetFacetSuggestions,
  getStarterSampleIds,
  getStarterPresetIds,
  ScoredCandidate,
  TasteSuggestion,
} from "@/lib/recommendations";

const SAMPLE_LIMIT = 24;
const PRESET_LIMIT = 12;
const FACET_LIMIT = 6;

// The recommendation is only as useful as the sentence explaining it, so every
// row carries the component that actually put it there.
function reasonFor(
  c: ScoredCandidate,
  item: { genre: string; artist_name: string; sub: string }
): string {
  if (c.cfNorm > 0 && c.supporters >= 2) {
    return `Bought by ${c.supporters} buyers with taste like yours`;
  }
  if (c.cfNorm > 0) return "Bought by a buyer with taste like yours";
  if (c.creatorW >= 0.75) return `More from ${item.artist_name}`;
  if (c.genreW >= c.subW) return `Matches your ${item.genre} picks`;
  return `Matches your ${item.sub} picks`;
}

function suggestionPayload(
  s: TasteSuggestion,
  label: string
): {
  value: string;
  label: string;
  available: number;
  buyers: number;
  owned: boolean;
  reason: string;
} {
  return {
    value: s.value,
    label,
    available: s.available,
    buyers: s.buyers,
    owned: s.owned,
    reason:
      s.buyers > 0
        ? `${s.buyers} similar buyer${s.buyers !== 1 ? "s" : ""}`
        : s.owned
          ? "You buy here"
          : "Popular on Greenroom",
  };
}

// GET /api/recommendations — personalised picks for the marketplace "For You" tab
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.id;
    const signals = await getRecommendationSignals(userId);
    const cold =
      signals.purchasedSamples === 0 &&
      signals.purchasedPresets === 0 &&
      signals.favorites === 0;

    if (cold) {
      const [sampleIds, presetIds, sampleFacets, presetFacets] = await Promise.all([
        getStarterSampleIds(userId, SAMPLE_LIMIT),
        getStarterPresetIds(userId, PRESET_LIMIT),
        getSampleFacetSuggestions(userId, FACET_LIMIT),
        getPresetFacetSuggestions(userId, FACET_LIMIT),
      ]);
      const [samples, presets] = await Promise.all([
        loadSamplesByIds(sampleIds),
        loadPresetsByIds(presetIds),
      ]);

      return NextResponse.json({
        cold: true,
        signals,
        samples: samples.map((s) => ({ ...s, reason: "Highly rated on Greenroom" })),
        presets: presets.map((p) => ({ ...p, reason: "Highly rated on Greenroom" })),
        genres: sampleFacets.genre.map((s) => suggestionPayload(s, s.value)),
        instrumentTypes: sampleFacets.instrument.map((s) => suggestionPayload(s, s.value)),
        presetCategories: presetFacets.category.map((s) =>
          suggestionPayload(s, CATEGORY_DISPLAY_NAMES[s.value] || s.value)
        ),
        presetSynths: presetFacets.synth.map((s) =>
          suggestionPayload(s, SYNTH_DISPLAY_NAMES[s.value] || s.value)
        ),
      });
    }

    const [sampleCandidates, presetCandidates, sampleFacets, presetFacets] =
      await Promise.all([
        getSampleCandidates(userId, SAMPLE_LIMIT),
        getPresetCandidates(userId, PRESET_LIMIT),
        getSampleFacetSuggestions(userId, FACET_LIMIT),
        getPresetFacetSuggestions(userId, FACET_LIMIT),
      ]);

    const [samples, presets] = await Promise.all([
      loadSamplesByIds(sampleCandidates.map((c) => c.id)),
      loadPresetsByIds(presetCandidates.map((c) => c.id)),
    ]);

    const sampleById = new Map(sampleCandidates.map((c) => [c.id, c]));
    const presetById = new Map(presetCandidates.map((c) => [c.id, c]));

    return NextResponse.json({
      cold: false,
      signals,
      samples: samples.map((s) => ({
        ...s,
        reason: reasonFor(sampleById.get(s.id)!, {
          genre: s.genre,
          artist_name: s.artist_name,
          sub: s.instrument_type,
        }),
      })),
      presets: presets.map((p) => ({
        ...p,
        reason: reasonFor(presetById.get(p.id)!, {
          genre: p.genre,
          artist_name: p.artist_name,
          sub: p.category_display_name,
        }),
      })),
      genres: sampleFacets.genre.map((s) => suggestionPayload(s, s.value)),
      instrumentTypes: sampleFacets.instrument.map((s) => suggestionPayload(s, s.value)),
      presetCategories: presetFacets.category.map((s) =>
        suggestionPayload(s, CATEGORY_DISPLAY_NAMES[s.value] || s.value)
      ),
      presetSynths: presetFacets.synth.map((s) =>
        suggestionPayload(s, SYNTH_DISPLAY_NAMES[s.value] || s.value)
      ),
    });
  } catch (error) {
    console.error("GET /api/recommendations error:", error);
    return NextResponse.json(
      { error: "Failed to build recommendations" },
      { status: 500 }
    );
  }
}

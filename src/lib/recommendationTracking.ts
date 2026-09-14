import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  RecommendationTrace,
  SampleFilter,
  ScoredCandidate,
} from "@/lib/recommendations";

// For You attribution: the first step toward learning from what the
// recommendations actually achieve. Every served list is logged as one
// impression, and a purchase or favorite made from that list is logged as an
// outcome pointing back at it. Together they answer "how often does a shown
// pick get bought, at which rank, on which signal?", and they keep the score
// parts a later step can fit the weights to.
//
// Tracking is strictly best-effort. A failure here must never cost anyone a
// list or a purchase, so every write catches and reports its own errors.

export interface ImpressionRow {
  ranker: string;
  cold: boolean;
  filters: Record<string, string>;
  sampleIds: string[];
  sampleScores: number[];
  sampleSimilarBuyers: number[];
  sampleGenre: number[];
  sampleInstrument: number[];
  sampleCreator: number[];
  sampleRating: number[];
  samplePopularity: number[];
  presetIds: string[];
  presetScores: number[];
  presetSimilarBuyers: number[];
  presetGenre: number[];
  presetCategory: number[];
  presetCreator: number[];
  presetRating: number[];
  presetPopularity: number[];
}

type NumericPart = "score" | "cfNorm" | "genreW" | "subW" | "creatorW" | "ratingW" | "damping";

const column = (parts: ScoredCandidate[], key: NumericPart) => parts.map((p) => p[key]);

// Pure: a served list → its impression row, one array per score part, all
// aligned with the ids by position.
export function toImpressionRow(
  cold: boolean,
  filter: SampleFilter,
  trace: RecommendationTrace
): ImpressionRow {
  const filters = Object.fromEntries(
    Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  const s = trace.sampleParts;
  const p = trace.presetParts;
  return {
    ranker: trace.ranker,
    cold,
    filters,
    sampleIds: trace.sampleIds,
    sampleScores: column(s, "score"),
    sampleSimilarBuyers: column(s, "cfNorm"),
    sampleGenre: column(s, "genreW"),
    sampleInstrument: column(s, "subW"),
    sampleCreator: column(s, "creatorW"),
    sampleRating: column(s, "ratingW"),
    samplePopularity: column(s, "damping"),
    presetIds: trace.presetIds,
    presetScores: column(p, "score"),
    presetSimilarBuyers: column(p, "cfNorm"),
    presetGenre: column(p, "genreW"),
    presetCategory: column(p, "subW"),
    presetCreator: column(p, "creatorW"),
    presetRating: column(p, "ratingW"),
    presetPopularity: column(p, "damping"),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Impression ids come back from the client; anything that isn't one is ignored. */
export function isImpressionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

let warnedMissingTables = false;

function reportTrackingError(what: string, error: unknown) {
  const pgCode =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? (error.meta as { code?: string } | undefined)?.code
      : undefined;
  // 42P01 = undefined table: this code shipped before its migration was
  // applied. Say so once rather than on every request.
  if (pgCode === "42P01") {
    if (!warnedMissingTables) {
      warnedMissingTables = true;
      console.warn(
        "[for-you] attribution tables are missing; tracking is off until " +
          "scripts/apply-recommendation-tracking-migration.ts has been run."
      );
    }
    return;
  }
  console.error(`[for-you] failed to record ${what}:`, error);
}

/** Logs a served list. Returns its id, or null when it couldn't be logged. */
export async function logRecommendationImpression(
  userId: string,
  cold: boolean,
  filter: SampleFilter,
  trace: RecommendationTrace
): Promise<string | null> {
  const row = toImpressionRow(cold, filter, trace);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO recommendation_impressions (
         id, user_id, ranker, cold, filters,
         sample_ids, sample_scores, sample_similar_buyers, sample_genre,
         sample_instrument, sample_creator, sample_rating, sample_popularity,
         preset_ids, preset_scores, preset_similar_buyers, preset_genre,
         preset_category, preset_creator, preset_rating, preset_popularity
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2, $3, $4::jsonb,
         $5::uuid[], $6::real[], $7::real[], $8::real[],
         $9::real[], $10::real[], $11::real[], $12::real[],
         $13::uuid[], $14::real[], $15::real[], $16::real[],
         $17::real[], $18::real[], $19::real[], $20::real[]
       )
       RETURNING id`,
      userId,
      row.ranker,
      row.cold,
      JSON.stringify(row.filters),
      row.sampleIds,
      row.sampleScores,
      row.sampleSimilarBuyers,
      row.sampleGenre,
      row.sampleInstrument,
      row.sampleCreator,
      row.sampleRating,
      row.samplePopularity,
      row.presetIds,
      row.presetScores,
      row.presetSimilarBuyers,
      row.presetGenre,
      row.presetCategory,
      row.presetCreator,
      row.presetRating,
      row.presetPopularity
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    reportTrackingError("impression", error);
    return null;
  }
}

/** Records a purchase or favorite made from a served list. No-op without a valid impression id. */
export async function recordRecommendationOutcome(input: {
  impressionId: unknown;
  userId: string;
  kind: "PURCHASE" | "FAVORITE";
  sampleId?: string | null;
  presetId?: string | null;
}): Promise<void> {
  if (!isImpressionId(input.impressionId)) return;
  const item = input.sampleId ? "sample" : input.presetId ? "preset" : null;
  const itemId = input.sampleId ?? input.presetId;
  if (!item || !itemId) return;

  try {
    // Lands only when the impression is this user's and actually showed the
    // item. The position is read from the impression, not trusted from the
    // client; a repeat (a double-tapped heart) is a no-op.
    await prisma.$executeRawUnsafe(
      `INSERT INTO recommendation_outcomes (id, impression_id, user_id, ${item}_id, kind, position)
       SELECT gen_random_uuid(), i.id, i.user_id, $3::uuid,
              $4::"RecommendationOutcomeKind", array_position(i.${item}_ids, $3::uuid)
         FROM recommendation_impressions i
        WHERE i.id = $1::uuid
          AND i.user_id = $2::uuid
          AND array_position(i.${item}_ids, $3::uuid) IS NOT NULL
       ON CONFLICT (impression_id, kind, ${item}_id) DO NOTHING`,
      input.impressionId,
      input.userId,
      itemId,
      input.kind
    );
  } catch (error) {
    reportTrackingError("outcome", error);
  }
}

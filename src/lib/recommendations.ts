import { prisma } from "@/lib/prisma";
import { loadSamplesByIds, loadPresetsByIds } from "@/lib/marketplaceItems";

// Recommendation scoring for the marketplace "For You" tab.
//
// Two signals are blended per candidate:
//
//   1. Collaborative filtering — find buyers whose purchase history overlaps
//      this user's, then score the items those neighbours bought and this user
//      has not. Neighbour similarity is cosine-ish (shared / sqrt(mine*theirs))
//      so the handful of whales with 700+ purchases don't end up "similar" to
//      everybody.
//   2. Content affinity — how much of the user's own spend sits in a candidate's
//      genre / instrument / creator. This carries users whose overlap with the
//      rest of the catalogue is still too thin for CF to say anything.
//
// The blend is then damped by item popularity so the same few best-sellers
// don't win every slot, and every scored row keeps its components so the UI can
// say *why* something was recommended.

// Signal weights. Purchases are the strong signal; a favorite is interest
// without commitment, so it seeds taste at half strength.
const PURCHASE_WEIGHT = 1.0;
const FAVORITE_WEIGHT = 0.5;

// A neighbour needs this many items in common before their taste counts.
const MIN_SHARED_ITEMS = 2;
// Cap on neighbours considered — beyond the closest few dozen the similarity
// tail is noise that only pulls results back toward global popularity.
const MAX_NEIGHBORS = 60;

// Most samples arrive as packs, so an uncapped ranking returns ten near-identical
// items from one creator: every item in a pack shares a genre, an instrument and
// a creator, which means it also shares a score. Capping per creator is what
// turns the list back into a set of distinct suggestions.
const MAX_PER_CREATOR = 3;

// Relevance holds to about here: measured on prod 2026-09-10, the score at rank
// 48 is still 0.49–0.70 of #1 (0.51–0.74 at 24); past ~100 picks thin out to
// genre filler.
const SAMPLE_LIMIT = 50;
const PRESET_LIMIT = 12;

// Names the scoring below. It is stored with every served list, so when the
// weights change, outcomes can be compared ranker against ranker.
export const RANKER_VERSION = "v1-hand-tuned";

// Below this many sample purchases, For You can't yet build a list from real
// signal for most buyers. Replaying 80 real buyers' first purchases
// (2026-09-10), 3 in 4 had 50+ picks backed by similar buyers only once they
// had bought 8 samples. Under it, the tab says that buying is how it learns.
const PURCHASES_TO_LEARN_TASTE = 8;

export interface ScoredCandidate {
  id: string;
  score: number;
  cfNorm: number;
  supporters: number;
  genreW: number;
  subW: number;
  creatorW: number;
  /** Rating signal before its 0.15 weight: (avg / 5) × (min(count, 5) / 5). */
  ratingW: number;
  /** The popularity divisor the weighted sum was damped by. */
  damping: number;
}

export interface RecommendationSignals {
  purchasedSamples: number;
  purchasedPresets: number;
  favorites: number;
}

// The Samples tab's filter bar as For You applies it. Sort is deliberately
// absent: the ranking is the point of the tab.
export interface SampleFilter {
  genre?: string;
  instrumentType?: string;
  sampleType?: "LOOP" | "ONE_SHOT";
  /** A full key ("C# Minor") or a bare note ("C"). */
  key?: string;
  /** "Major" or "Minor". */
  scale?: string;
}

// Reads the same query params the marketplace sends to /api/samples.
export function parseRecommendationFilters(
  searchParams: URLSearchParams
): SampleFilter {
  const pick = (name: string) => {
    const value = searchParams.get(name);
    return value && value !== "all" ? value : undefined;
  };
  const sampleType = pick("sampleType")?.toUpperCase();
  return {
    genre: pick("genre"),
    instrumentType: pick("instrumentType"),
    sampleType:
      sampleType === "LOOP" || sampleType === "ONE_SHOT" ? sampleType : undefined,
    key: pick("key"),
    scale: pick("scale"),
  };
}

function isFiltered(filter: SampleFilter): boolean {
  return Object.values(filter).some(Boolean);
}

// Renders a filter as extra WHERE clauses over the `samples s` alias. Bind
// parameters are numbered from $3 — $1 and $2 are the user id and the limit.
function sampleFilterSql(filter: SampleFilter): { sql: string; params: string[] } {
  const params: string[] = [];
  const bind = (value: string) => {
    params.push(value);
    return `$${params.length + 2}`;
  };

  const clauses: string[] = [];
  if (filter.genre) clauses.push(`s.genre = ${bind(filter.genre)}`);
  if (filter.instrumentType) {
    clauses.push(`s.instrument_type = ${bind(filter.instrumentType)}`);
  }
  if (filter.sampleType) {
    // Enum column: a text bind needs the explicit cast (see /api/samples).
    clauses.push(`s.sample_type = ${bind(filter.sampleType)}::"SampleType"`);
  }
  if (filter.key?.includes(" ")) {
    clauses.push(`s.key = ${bind(filter.key)}`);
  } else if (filter.key && filter.scale) {
    clauses.push(`s.key = ${bind(`${filter.key} ${filter.scale}`)}`);
  } else if (filter.key) {
    // A bare note compares the note token rather than a prefix: "C" must not
    // also match "C# Minor", which a LIKE 'C%' would.
    clauses.push(`split_part(s.key, ' ', 1) = ${bind(filter.key)}`);
  } else if (filter.scale) {
    clauses.push(`split_part(s.key, ' ', 2) = ${bind(filter.scale)}`);
  }

  return { sql: clauses.map((c) => `AND ${c}`).join(" "), params };
}

// Unfiltered, the list holds only items the user's history speaks to. A filter
// can rule all of those out (a genre they never buy), so under one the
// requirement drops and personal signal just ranks first.
function signalRequirement(filtered: boolean): string {
  return filtered ? "true" : "cf_norm > 0 OR genre_w > 0 OR sub_w > 0";
}

export async function getRecommendationSignals(
  userId: string
): Promise<RecommendationSignals> {
  const [purchasedSamples, purchasedPresets, favorites] = await Promise.all([
    prisma.purchase.count({ where: { userId, sampleId: { not: null } } }),
    prisma.purchase.count({ where: { userId, presetId: { not: null } } }),
    prisma.favorite.count({ where: { userId } }),
  ]);
  return { purchasedSamples, purchasedPresets, favorites };
}

// Shared CTE prelude: the user's weighted taste items, the items they already
// own, and their nearest neighbours. `col` is "sample_id" or "preset_id" so the
// same shape serves both catalogues.
function signalCtes(col: "sample_id" | "preset_id"): string {
  return `
    my_signals AS (
      SELECT ${col} AS item_id, ${PURCHASE_WEIGHT}::float8 AS w
        FROM purchases WHERE user_id = $1::uuid AND ${col} IS NOT NULL
      UNION ALL
      SELECT ${col} AS item_id, ${FAVORITE_WEIGHT}::float8 AS w
        FROM favorites WHERE user_id = $1::uuid AND ${col} IS NOT NULL
    ),
    my_items AS (
      SELECT item_id, MAX(w) AS w FROM my_signals GROUP BY item_id
    ),
    owned AS (
      SELECT ${col} AS item_id
        FROM purchases WHERE user_id = $1::uuid AND ${col} IS NOT NULL
    ),
    my_norm AS (SELECT GREATEST(SUM(w), 1)::float8 AS n FROM my_items),
    their_counts AS (
      SELECT user_id, COUNT(*)::float8 AS n
        FROM purchases WHERE ${col} IS NOT NULL GROUP BY user_id
    ),
    neighbors AS (
      SELECT p.user_id,
             SUM(mi.w) / sqrt((SELECT n FROM my_norm) * tc.n) AS sim
        FROM purchases p
        JOIN my_items mi ON mi.item_id = p.${col}
        JOIN their_counts tc ON tc.user_id = p.user_id
       WHERE p.user_id <> $1::uuid
       GROUP BY p.user_id, tc.n
      HAVING COUNT(*) >= ${MIN_SHARED_ITEMS}
       ORDER BY sim DESC
       LIMIT ${MAX_NEIGHBORS}
    ),
    cf_raw AS (
      SELECT p.${col} AS id, SUM(n.sim) AS score, COUNT(*)::int AS supporters
        FROM purchases p
        JOIN neighbors n ON n.user_id = p.user_id
       WHERE p.${col} IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.item_id = p.${col})
       GROUP BY p.${col}
    ),
    cf AS (
      SELECT id, supporters,
             score / NULLIF(MAX(score) OVER (), 0) AS cf_norm
        FROM cf_raw
    )`;
}

type ScoredRow = {
  id: string;
  score: number;
  cf_norm: number;
  supporters: number;
  genre_w: number;
  sub_w: number;
  creator_w: number;
  rating_w: number;
  damping: number;
};

function toCandidate(r: ScoredRow): ScoredCandidate {
  return {
    id: r.id,
    score: Number(r.score),
    cfNorm: Number(r.cf_norm),
    supporters: Number(r.supporters),
    genreW: Number(r.genre_w),
    subW: Number(r.sub_w),
    creatorW: Number(r.creator_w),
    ratingW: Number(r.rating_w),
    damping: Number(r.damping),
  };
}

export async function getSampleCandidates(
  userId: string,
  limit: number,
  filter: SampleFilter = {}
): Promise<ScoredCandidate[]> {
  const { sql: filterSql, params } = sampleFilterSql(filter);
  const rows = await prisma.$queryRawUnsafe<ScoredRow[]>(
    `WITH ${signalCtes("sample_id")},
      taste_genre AS (
        SELECT s.genre AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN samples s ON s.id = mi.item_id GROUP BY s.genre
      ),
      taste_genre_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_genre
      ),
      taste_sub AS (
        SELECT s.instrument_type AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN samples s ON s.id = mi.item_id
         GROUP BY s.instrument_type
      ),
      taste_sub_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_sub
      ),
      taste_creator AS (
        SELECT s.creator_id AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN samples s ON s.id = mi.item_id GROUP BY s.creator_id
      ),
      taste_creator_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_creator
      ),
      candidates AS (
        SELECT s.id, s.creator_id,
               COALESCE(cf.cf_norm, 0)     AS cf_norm,
               COALESCE(cf.supporters, 0)  AS supporters,
               COALESCE(tg.w, 0)           AS genre_w,
               COALESCE(ts.w, 0)           AS sub_w,
               COALESCE(tcr.w, 0)          AS creator_w,
               s.rating_avg, s.rating_count, s.download_count
          FROM samples s
          LEFT JOIN cf              ON cf.id  = s.id
          LEFT JOIN taste_genre_n   tg  ON tg.v  = s.genre
          LEFT JOIN taste_sub_n     ts  ON ts.v  = s.instrument_type
          LEFT JOIN taste_creator_n tcr ON tcr.v = s.creator_id
         WHERE s.status = 'PUBLISHED' AND s.is_active = true
           AND s.creator_id <> $1::uuid
           AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.item_id = s.id)
           ${filterSql}
      ),
      parts AS (
        SELECT id, creator_id, cf_norm, supporters, genre_w, sub_w, creator_w,
               (rating_avg / 5.0) * (LEAST(rating_count, 5) / 5.0) AS rating_w,
               power(1 + ln(1 + download_count), 0.35) AS damping
          FROM candidates
         WHERE ${signalRequirement(isFiltered(filter))}
      ),
      scored AS (
        SELECT *,
               (
                   1.00 * cf_norm
                 + 0.45 * genre_w
                 + 0.30 * sub_w
                 + 0.25 * creator_w
                 + 0.15 * rating_w
               ) / damping AS score,
               -- Pack items tie exactly on score; hashing the id with the user
               -- breaks those ties into a stable per-user order instead of
               -- whatever the planner happened to emit.
               md5(id::text || $1) AS tiebreak
          FROM parts
      ),
      capped AS (
        SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY creator_id ORDER BY score DESC, tiebreak
                  ) AS creator_rank
          FROM scored
      )
      SELECT id, cf_norm, supporters, genre_w, sub_w, creator_w, rating_w, damping, score
        FROM capped
       WHERE creator_rank <= ${MAX_PER_CREATOR}
       ORDER BY score DESC, tiebreak
       LIMIT $2`,
    userId,
    limit,
    ...params
  );

  return rows.map(toCandidate);
}

// Presets carry a genre but no instrument, type or key, so genre is the only
// part of the filter bar they can be narrowed by.
export async function getPresetCandidates(
  userId: string,
  limit: number,
  genre?: string
): Promise<ScoredCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<ScoredRow[]>(
    `WITH ${signalCtes("preset_id")},
      taste_genre AS (
        SELECT pr.genre AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN presets pr ON pr.id = mi.item_id GROUP BY pr.genre
      ),
      taste_genre_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_genre
      ),
      taste_sub AS (
        SELECT pr.preset_category AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN presets pr ON pr.id = mi.item_id
         GROUP BY pr.preset_category
      ),
      taste_sub_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_sub
      ),
      taste_creator AS (
        SELECT pr.creator_id AS v, SUM(mi.w) AS w
          FROM my_items mi JOIN presets pr ON pr.id = mi.item_id GROUP BY pr.creator_id
      ),
      taste_creator_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM taste_creator
      ),
      -- Presets are a small catalogue (dozens, not thousands), so a user's
      -- SAMPLE genre taste is the better steer when their preset history is
      -- empty. It is folded in at half weight behind any real preset signal.
      sample_genre AS (
        SELECT s.genre AS v, SUM(w) AS w FROM (
          SELECT sample_id AS item_id, ${PURCHASE_WEIGHT}::float8 AS w
            FROM purchases WHERE user_id = $1::uuid AND sample_id IS NOT NULL
          UNION ALL
          SELECT sample_id AS item_id, ${FAVORITE_WEIGHT}::float8 AS w
            FROM favorites WHERE user_id = $1::uuid AND sample_id IS NOT NULL
        ) si JOIN samples s ON s.id = si.item_id
        GROUP BY s.genre
      ),
      sample_genre_n AS (
        SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM sample_genre
      ),
      candidates AS (
        SELECT pr.id, pr.creator_id,
               COALESCE(cf.cf_norm, 0)     AS cf_norm,
               COALESCE(cf.supporters, 0)  AS supporters,
               GREATEST(COALESCE(tg.w, 0), 0.5 * COALESCE(sg.w, 0)) AS genre_w,
               COALESCE(ts.w, 0)           AS sub_w,
               COALESCE(tcr.w, 0)          AS creator_w,
               pr.rating_avg, pr.rating_count, pr.download_count
          FROM presets pr
          LEFT JOIN cf              ON cf.id  = pr.id
          LEFT JOIN taste_genre_n   tg  ON tg.v  = pr.genre
          LEFT JOIN sample_genre_n  sg  ON sg.v  = pr.genre
          LEFT JOIN taste_sub_n     ts  ON ts.v  = pr.preset_category
          LEFT JOIN taste_creator_n tcr ON tcr.v = pr.creator_id
         WHERE pr.status = 'PUBLISHED' AND pr.is_active = true
           AND pr.creator_id <> $1::uuid
           AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.item_id = pr.id)
           ${genre ? "AND pr.genre = $3" : ""}
      ),
      parts AS (
        SELECT id, creator_id, cf_norm, supporters, genre_w, sub_w, creator_w,
               (rating_avg / 5.0) * (LEAST(rating_count, 5) / 5.0) AS rating_w,
               power(1 + ln(1 + download_count), 0.35) AS damping
          FROM candidates
         WHERE ${signalRequirement(Boolean(genre))}
      ),
      scored AS (
        SELECT *,
               (
                   1.00 * cf_norm
                 + 0.45 * genre_w
                 + 0.30 * sub_w
                 + 0.25 * creator_w
                 + 0.15 * rating_w
               ) / damping AS score,
               md5(id::text || $1) AS tiebreak
          FROM parts
      ),
      capped AS (
        SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY creator_id ORDER BY score DESC, tiebreak
                  ) AS creator_rank
          FROM scored
      )
      SELECT id, cf_norm, supporters, genre_w, sub_w, creator_w, rating_w, damping, score
        FROM capped
       WHERE creator_rank <= ${MAX_PER_CREATOR}
       ORDER BY score DESC, tiebreak
       LIMIT $2`,
    userId,
    limit,
    ...(genre ? [genre] : [])
  );

  return rows.map(toCandidate);
}

// ─────────────────────────────────────────────
// COLD START
// ─────────────────────────────────────────────

// Nothing personal to lean on: well-rated items with enough buyers to be a
// safe pick. Serves brand-new users, and tops up a personal list that runs
// short, so owned samples and `excludeIds` (picks already in the list) are
// skipped. The parts are what these items really have: no personal signal,
// only a rating and a popularity, so `score` is what the personal ranker would
// give them.
export async function getStarterSamples(
  userId: string,
  limit: number,
  filter: SampleFilter = {},
  excludeIds: string[] = []
): Promise<ScoredCandidate[]> {
  const { sql: filterSql, params } = sampleFilterSql(filter);
  const excludeParam = `$${params.length + 3}`;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; rating_w: number; damping: number }>
  >(
    `WITH scored AS (
       SELECT s.id, s.creator_id,
              (s.rating_avg / 5.0) * (LEAST(s.rating_count, 5) / 5.0) AS rating_w,
              power(1 + ln(1 + s.download_count), 0.35) AS damping,
              0.6 * (s.rating_avg / 5.0) * (LEAST(s.rating_count, 5) / 5.0)
            + 0.4 * (ln(1 + s.download_count) / 5.0) AS popularity
         FROM samples s
        WHERE s.status = 'PUBLISHED' AND s.is_active = true
          AND s.creator_id <> $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM purchases o WHERE o.user_id = $1::uuid AND o.sample_id = s.id
          )
          AND NOT (s.id = ANY(${excludeParam}::uuid[]))
          ${filterSql}
     ),
     capped AS (
       SELECT *, ROW_NUMBER() OVER (
                   PARTITION BY creator_id ORDER BY popularity DESC, id
                 ) AS creator_rank
         FROM scored
     )
     SELECT id, rating_w, damping FROM capped
      WHERE creator_rank <= ${MAX_PER_CREATOR}
      ORDER BY popularity DESC, id
      LIMIT $2`,
    userId,
    limit,
    ...params,
    excludeIds
  );
  return rows.map((r) => {
    const ratingW = Number(r.rating_w);
    const damping = Number(r.damping);
    return {
      id: r.id,
      score: (0.15 * ratingW) / damping,
      cfNorm: 0,
      supporters: 0,
      genreW: 0,
      subW: 0,
      creatorW: 0,
      ratingW,
      damping,
    };
  });
}

export async function getStarterPresetIds(
  userId: string,
  limit: number,
  genre?: string
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `WITH scored AS (
       SELECT pr.id, pr.creator_id,
              0.6 * (pr.rating_avg / 5.0) * (LEAST(pr.rating_count, 5) / 5.0)
            + 0.4 * (ln(1 + pr.download_count) / 5.0) AS score
         FROM presets pr
        WHERE pr.status = 'PUBLISHED' AND pr.is_active = true
          AND pr.creator_id <> $1::uuid
          ${genre ? "AND pr.genre = $3" : ""}
     ),
     capped AS (
       SELECT *, ROW_NUMBER() OVER (
                   PARTITION BY creator_id ORDER BY score DESC, id
                 ) AS creator_rank
         FROM scored
     )
     SELECT id FROM capped
      WHERE creator_rank <= ${MAX_PER_CREATOR}
      ORDER BY score DESC, id
      LIMIT $2`,
    userId,
    limit,
    ...(genre ? [genre] : [])
  );
  return rows.map((r) => r.id);
}

// ─────────────────────────────────────────────
// PAYLOAD
// ─────────────────────────────────────────────

// What a served list was built from, for attribution (recommendationTracking.ts).
// It stays on the server; the API route strips it before responding.
export interface RecommendationTrace {
  ranker: string;
  sampleIds: string[];
  presetIds: string[];
  /** Score parts aligned with the ids. Empty for a cold-start list, which isn't scored. */
  sampleParts: ScoredCandidate[];
  presetParts: ScoredCandidate[];
}

// The recommendation is only as useful as the sentence explaining it, so every
// row carries the component that actually put it there — or nothing, when only
// a filter did.
function reasonFor(
  c: ScoredCandidate,
  item: { genre: string; artistName: string; sub: string }
): string | undefined {
  if (c.cfNorm > 0 && c.supporters >= 2) {
    return `Bought by ${c.supporters} buyers with taste like yours`;
  }
  if (c.cfNorm > 0) return "Bought by a buyer with taste like yours";
  if (c.creatorW >= 0.75) return `More from ${item.artistName}`;
  if (c.genreW > 0 && c.genreW >= c.subW) return `Matches your ${item.genre} picks`;
  if (c.subW > 0) return `Matches your ${item.sub} picks`;
  if (c.creatorW > 0) return `More from ${item.artistName}`;
  return undefined;
}

const POPULAR_REASON = "Popular on Greenroom";

export async function buildRecommendations(userId: string, filter: SampleFilter) {
  const signals = await getRecommendationSignals(userId);
  const cold =
    signals.purchasedSamples === 0 &&
    signals.purchasedPresets === 0 &&
    signals.favorites === 0;
  const needsMoreHistory = signals.purchasedSamples < PURCHASES_TO_LEARN_TASTE;
  // An instrument, type or key filter rules out every preset (they have none
  // of those), so the preset list is skipped rather than queried to empty.
  const presetsMatch =
    !filter.instrumentType && !filter.sampleType && !filter.key && !filter.scale;

  if (cold) {
    const [starters, presetIds] = await Promise.all([
      getStarterSamples(userId, SAMPLE_LIMIT, filter),
      presetsMatch
        ? getStarterPresetIds(userId, PRESET_LIMIT, filter.genre)
        : Promise.resolve([] as string[]),
    ]);
    const [samples, presets] = await Promise.all([
      loadSamplesByIds(starters.map((c) => c.id)),
      loadPresetsByIds(presetIds),
    ]);
    const trace: RecommendationTrace = {
      ranker: RANKER_VERSION,
      sampleIds: samples.map((s) => s.id),
      presetIds: presets.map((p) => p.id),
      sampleParts: [],
      presetParts: [],
    };
    return {
      cold,
      needsMoreHistory,
      signals,
      samples: samples.map((s) => ({ ...s, reason: POPULAR_REASON })),
      presets: presets.map((p) => ({ ...p, reason: POPULAR_REASON })),
      trace,
    };
  }

  const [personal, presetCandidates] = await Promise.all([
    getSampleCandidates(userId, SAMPLE_LIMIT, filter),
    presetsMatch
      ? getPresetCandidates(userId, PRESET_LIMIT, filter.genre)
      : Promise.resolve([] as ScoredCandidate[]),
  ]);

  // Everyone gets a full list. Unfiltered, a personal pool that runs short is
  // topped up with popular picks; under a filter the pool already holds every
  // match, so there is nothing left to add.
  const topUp =
    !isFiltered(filter) && personal.length < SAMPLE_LIMIT
      ? await getStarterSamples(
          userId,
          SAMPLE_LIMIT - personal.length,
          filter,
          personal.map((c) => c.id)
        )
      : [];
  const sampleCandidates = [...personal, ...topUp];
  const toppedUp = new Set(topUp.map((c) => c.id));

  const [samples, presets] = await Promise.all([
    loadSamplesByIds(sampleCandidates.map((c) => c.id)),
    loadPresetsByIds(presetCandidates.map((c) => c.id)),
  ]);

  const sampleById = new Map(sampleCandidates.map((c) => [c.id, c]));
  const presetById = new Map(presetCandidates.map((c) => [c.id, c]));

  // Aligned with what was actually hydrated and shown, not with the ranking:
  // an item deleted between ranking and hydration never reached the user.
  const trace: RecommendationTrace = {
    ranker: RANKER_VERSION,
    sampleIds: samples.map((s) => s.id),
    presetIds: presets.map((p) => p.id),
    sampleParts: samples.map((s) => sampleById.get(s.id)!),
    presetParts: presets.map((p) => presetById.get(p.id)!),
  };

  return {
    cold,
    needsMoreHistory,
    signals,
    samples: samples.map((s) => ({
      ...s,
      reason: toppedUp.has(s.id)
        ? POPULAR_REASON
        : reasonFor(sampleById.get(s.id)!, {
            genre: s.genre,
            artistName: s.artist_name,
            sub: s.instrument_type,
          }),
    })),
    presets: presets.map((p) => ({
      ...p,
      reason: reasonFor(presetById.get(p.id)!, {
        genre: p.genre,
        artistName: p.artist_name,
        sub: p.category_display_name,
      }),
    })),
    trace,
  };
}

import { prisma } from "@/lib/prisma";

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

export interface ScoredCandidate {
  id: string;
  score: number;
  cfNorm: number;
  supporters: number;
  genreW: number;
  subW: number;
  creatorW: number;
}

export interface TasteSuggestion {
  value: string;
  score: number;
  /** Published, unowned items left to buy under this facet. */
  available: number;
  /** How many similar buyers bought into it. */
  buyers: number;
  /** True when the user has bought here before (deepen) vs. not (discover). */
  owned: boolean;
}

export interface RecommendationSignals {
  purchasedSamples: number;
  purchasedPresets: number;
  favorites: number;
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

export async function getSampleCandidates(
  userId: string,
  limit: number
): Promise<ScoredCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      score: number;
      cf_norm: number;
      supporters: number;
      genre_w: number;
      sub_w: number;
      creator_w: number;
    }>
  >(
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
      ),
      scored AS (
        SELECT id, creator_id, cf_norm, supporters, genre_w, sub_w, creator_w,
               (
                   1.00 * cf_norm
                 + 0.45 * genre_w
                 + 0.30 * sub_w
                 + 0.25 * creator_w
                 + 0.15 * (rating_avg / 5.0) * (LEAST(rating_count, 5) / 5.0)
               ) / power(1 + ln(1 + download_count), 0.35) AS score,
               -- Pack items tie exactly on score; hashing the id with the user
               -- breaks those ties into a stable per-user order instead of
               -- whatever the planner happened to emit.
               md5(id::text || $1) AS tiebreak
          FROM candidates
         WHERE cf_norm > 0 OR genre_w > 0 OR sub_w > 0
      ),
      capped AS (
        SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY creator_id ORDER BY score DESC, tiebreak
                  ) AS creator_rank
          FROM scored
      )
      SELECT id, cf_norm, supporters, genre_w, sub_w, creator_w, score
        FROM capped
       WHERE creator_rank <= ${MAX_PER_CREATOR}
       ORDER BY score DESC, tiebreak
       LIMIT $2`,
    userId,
    limit
  );

  return rows.map((r) => ({
    id: r.id,
    score: Number(r.score),
    cfNorm: Number(r.cf_norm),
    supporters: Number(r.supporters),
    genreW: Number(r.genre_w),
    subW: Number(r.sub_w),
    creatorW: Number(r.creator_w),
  }));
}

export async function getPresetCandidates(
  userId: string,
  limit: number
): Promise<ScoredCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      score: number;
      cf_norm: number;
      supporters: number;
      genre_w: number;
      sub_w: number;
      creator_w: number;
    }>
  >(
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
      ),
      scored AS (
        SELECT id, creator_id, cf_norm, supporters, genre_w, sub_w, creator_w,
               (
                   1.00 * cf_norm
                 + 0.45 * genre_w
                 + 0.30 * sub_w
                 + 0.25 * creator_w
                 + 0.15 * (rating_avg / 5.0) * (LEAST(rating_count, 5) / 5.0)
               ) / power(1 + ln(1 + download_count), 0.35) AS score,
               md5(id::text || $1) AS tiebreak
          FROM candidates
         WHERE cf_norm > 0 OR genre_w > 0 OR sub_w > 0
      ),
      capped AS (
        SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY creator_id ORDER BY score DESC, tiebreak
                  ) AS creator_rank
          FROM scored
      )
      SELECT id, cf_norm, supporters, genre_w, sub_w, creator_w, score
        FROM capped
       WHERE creator_rank <= ${MAX_PER_CREATOR}
       ORDER BY score DESC, tiebreak
       LIMIT $2`,
    userId,
    limit
  );

  return rows.map((r) => ({
    id: r.id,
    score: Number(r.score),
    cfNorm: Number(r.cf_norm),
    supporters: Number(r.supporters),
    genreW: Number(r.genre_w),
    subW: Number(r.sub_w),
    creatorW: Number(r.creator_w),
  }));
}

// ─────────────────────────────────────────────
// FACET SUGGESTIONS (genre + sub-category chips)
// ─────────────────────────────────────────────

// Columns the facet query may group by. The value is interpolated into SQL, so
// it is deliberately a closed set rather than caller-supplied text.
const SAMPLE_FACETS = { genre: "genre", instrument: "instrument_type" } as const;
const PRESET_FACETS = {
  genre: "genre",
  category: "preset_category",
  synth: "synth_name",
} as const;

export type SampleFacet = keyof typeof SAMPLE_FACETS;
export type PresetFacet = keyof typeof PRESET_FACETS;

// A facet is worth suggesting when similar buyers are active in it AND there is
// something left to buy. Neighbour weight leads so the chips point at places to
// explore, not just a mirror of what the user already owns.
//
// Every facet of a catalogue is answered by one query: they all hang off the
// same neighbour CTEs, and deriving those once per facet was the most expensive
// thing this module did.
function facetSql(
  table: "samples" | "presets",
  itemCol: "sample_id" | "preset_id",
  facets: Record<string, string>
): string {
  // Each branch is parenthesised so its own ORDER BY/LIMIT applies to that
  // facet rather than to the union as a whole.
  const branches = Object.keys(facets)
    .map(
      (key) => `(
      SELECT '${key}'::text AS facet,
             a.v AS value,
             a.available,
             COALESCE(nb.buyers, 0) AS buyers,
             (own.w IS NOT NULL) AS owned,
             0.6 * COALESCE(nb.w, 0) + 0.4 * COALESCE(own.w, 0) AS score
        FROM avail_${key} a
        LEFT JOIN nb_${key}  nb  ON nb.v  = a.v
        LEFT JOIN own_${key} own ON own.v = a.v
       WHERE a.available > 0
         AND (nb.w IS NOT NULL OR own.w IS NOT NULL)
       ORDER BY score DESC
       LIMIT $2)`
    )
    .join("\n      UNION ALL\n      ");

  const ctes = Object.entries(facets)
    .map(
      ([key, col]) => `
    own_raw_${key} AS (
      SELECT t.${col}::text AS v, SUM(mi.w) AS w
        FROM my_items mi JOIN ${table} t ON t.id = mi.item_id
       GROUP BY t.${col}
    ),
    own_${key} AS (SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w FROM own_raw_${key}),
    nb_raw_${key} AS (
      SELECT t.${col}::text AS v,
             SUM(n.sim) AS w,
             COUNT(DISTINCT n.user_id)::int AS buyers
        FROM purchases p
        JOIN neighbors n ON n.user_id = p.user_id
        JOIN ${table} t ON t.id = p.${itemCol}
       WHERE p.${itemCol} IS NOT NULL
       GROUP BY t.${col}
    ),
    nb_${key} AS (
      SELECT v, w / NULLIF(MAX(w) OVER (), 0) AS w, buyers FROM nb_raw_${key}
    ),
    avail_${key} AS (
      SELECT t.${col}::text AS v, COUNT(*)::int AS available
        FROM ${table} t
       WHERE t.status = 'PUBLISHED' AND t.is_active = true
         AND t.creator_id <> $1::uuid
         AND NOT EXISTS (SELECT 1 FROM owned o WHERE o.item_id = t.id)
       GROUP BY t.${col}
    )`
    )
    .join(",");

  return `WITH ${signalCtes(itemCol)},${ctes}\n      ${branches}`;
}

async function runFacetQuery<K extends string>(
  sql: string,
  userId: string,
  perFacetLimit: number,
  keys: readonly K[]
): Promise<Record<K, TasteSuggestion[]>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      facet: string;
      value: string;
      available: number;
      buyers: number;
      owned: boolean;
      score: number;
    }>
  >(sql, userId, perFacetLimit);

  const out = {} as Record<K, TasteSuggestion[]>;
  for (const k of keys) out[k] = [];
  for (const r of rows) {
    const bucket = out[r.facet as K];
    if (!bucket) continue;
    bucket.push({
      value: r.value,
      available: Number(r.available),
      buyers: Number(r.buyers),
      owned: Boolean(r.owned),
      score: Number(r.score),
    });
  }
  // UNION ALL does not preserve each branch's ORDER BY, so rank per facet here.
  for (const k of keys) out[k].sort((a, b) => b.score - a.score);
  return out;
}

// Users with one or two purchases produce a one-chip row, which reads as broken
// rather than as personalised. Top the row up with the facets the catalogue
// actually sells, so there is always somewhere to go next.
async function topUpFacets<K extends string>(
  table: "samples" | "presets",
  itemCol: "sample_id" | "preset_id",
  facets: Record<string, string>,
  userId: string,
  perFacetLimit: number,
  current: Record<K, TasteSuggestion[]>
): Promise<Record<K, TasteSuggestion[]>> {
  const thin = (Object.keys(facets) as K[]).filter(
    (k) => current[k].length < perFacetLimit
  );
  if (thin.length === 0) return current;

  const sellable = `t.status = 'PUBLISHED' AND t.is_active = true
                 AND t.creator_id <> $1::uuid
                 AND NOT EXISTS (
                   SELECT 1 FROM purchases o
                    WHERE o.user_id = $1::uuid AND o.${itemCol} = t.id
                 )`;

  const branches = thin
    .map(
      (key) => `(
      SELECT '${key}'::text AS facet, t.${facets[key]}::text AS value,
             -- DISTINCT: the purchases join fans each item out into one row
             -- per sale, so a plain COUNT would count catalogue size in sales.
             COUNT(DISTINCT t.id) FILTER (WHERE ${sellable})::int AS available,
             COUNT(p.id)::int AS buys
        FROM ${table} t
        LEFT JOIN purchases p ON p.${itemCol} = t.id
       GROUP BY t.${facets[key]}
      HAVING COUNT(DISTINCT t.id) FILTER (WHERE ${sellable}) > 0
       ORDER BY buys DESC
       LIMIT $2)`
    )
    .join("\n      UNION ALL\n      ");

  const rows = await prisma.$queryRawUnsafe<
    Array<{ facet: string; value: string; available: number; buys: number }>
  >(branches, userId, perFacetLimit);

  for (const k of thin) {
    const seen = new Set(current[k].map((v) => v.value));
    for (const r of rows) {
      if (r.facet !== k || seen.has(r.value)) continue;
      if (current[k].length >= perFacetLimit) break;
      seen.add(r.value);
      current[k].push({
        value: r.value,
        available: Number(r.available),
        buyers: 0,
        owned: false,
        // Sorts below every personalised suggestion, which score at least 0.
        score: -1,
      });
    }
  }
  return current;
}

export async function getSampleFacetSuggestions(
  userId: string,
  perFacetLimit: number
): Promise<Record<SampleFacet, TasteSuggestion[]>> {
  const found = await runFacetQuery(
    facetSql("samples", "sample_id", SAMPLE_FACETS),
    userId,
    perFacetLimit,
    Object.keys(SAMPLE_FACETS) as SampleFacet[]
  );
  return topUpFacets("samples", "sample_id", SAMPLE_FACETS, userId, perFacetLimit, found);
}

export async function getPresetFacetSuggestions(
  userId: string,
  perFacetLimit: number
): Promise<Record<PresetFacet, TasteSuggestion[]>> {
  const found = await runFacetQuery(
    facetSql("presets", "preset_id", PRESET_FACETS),
    userId,
    perFacetLimit,
    Object.keys(PRESET_FACETS) as PresetFacet[]
  );
  return topUpFacets("presets", "preset_id", PRESET_FACETS, userId, perFacetLimit, found);
}

// ─────────────────────────────────────────────
// COLD START
// ─────────────────────────────────────────────

// No purchases and no favorites: nothing personal to lean on, so fall back to
// well-rated items with enough buyers to be a safe first pick.
export async function getStarterSampleIds(
  userId: string,
  limit: number
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `WITH scored AS (
       SELECT s.id, s.creator_id,
              0.6 * (s.rating_avg / 5.0) * (LEAST(s.rating_count, 5) / 5.0)
            + 0.4 * (ln(1 + s.download_count) / 5.0) AS score
         FROM samples s
        WHERE s.status = 'PUBLISHED' AND s.is_active = true
          AND s.creator_id <> $1::uuid
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
    limit
  );
  return rows.map((r) => r.id);
}

export async function getStarterPresetIds(
  userId: string,
  limit: number
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `WITH scored AS (
       SELECT pr.id, pr.creator_id,
              0.6 * (pr.rating_avg / 5.0) * (LEAST(pr.rating_count, 5) / 5.0)
            + 0.4 * (ln(1 + pr.download_count) / 5.0) AS score
         FROM presets pr
        WHERE pr.status = 'PUBLISHED' AND pr.is_active = true
          AND pr.creator_id <> $1::uuid
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
    limit
  );
  return rows.map((r) => r.id);
}

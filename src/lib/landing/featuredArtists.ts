/**
 * Curated "Verified creators" lineup for the landing page, in display order.
 *
 * These are real creators on the platform. Their avatars + a representative
 * genre are resolved from live data by /api/landing/creators; the landing page
 * falls back to a monogram tile for any name that can't be resolved so the row
 * always renders. Matching against `artistName` is case-insensitive, so the
 * casing here is purely cosmetic (the DB stores e.g. "Quix", "Ekali").
 */
export const FEATURED_ARTISTS = [
  "QUIX",
  "EKALI",
  "JUELZ",
  "MONTELL2099",
  "JAWNS",
  "KOMPANY",
  "DREZO",
] as const;

export interface FeaturedCreator {
  name: string;
  avatar: string | null;
  genre: string | null;
}

/**
 * Demo catalog for LOCAL DEVELOPMENT ONLY.
 *
 * The landing page falls back to this set when the live `/api/samples` feed is
 * empty (which it usually is on a fresh local database), so the interactive
 * marketplace preview, the creator tiles and the live stat are all previewable
 * without seeding Postgres. Preview audio points at the real teaser clips in
 * /public so playback actually works.
 *
 * Consumers gate usage behind `process.env.NODE_ENV !== "production"`, so this
 * module and its data are dead-code-eliminated from production bundles.
 */

export interface DemoSample {
  id: string;
  name: string;
  artist_name?: string;
  creator_id: string;
  creator_avatar?: string | null;
  genre?: string;
  instrument_type?: string;
  sample_type?: string; // "LOOP" | "ONE_SHOT"
  key?: string;
  bpm?: number;
  tags?: string[];
  preview_url?: string;
  waveform_data?: number[] | null;
}

// Deterministic bar heights so the waveforms render without decoding audio and
// stay stable across renders (no Math.random → no hydration churn).
const wave = (seed: number): number[] =>
  Array.from({ length: 48 }, (_, i) => 0.18 + (((i * 7 + seed * 13) % 11) / 13));

const TEASERS = ["/teaser-1.mp3", "/teaser-2.mp3"];

type Seed = Omit<DemoSample, "id" | "creator_id" | "preview_url" | "waveform_data" | "creator_avatar">;

// Ordered best-seller-first (mirrors the popular sort). The first sample of each
// instrument category is therefore that category's top seller — which is what
// the marketplace preview surfaces in its default "All instruments" view.
const SEEDS: Seed[] = [
  { name: "Midnight Kick", artist_name: "QUIX", genre: "Trap", instrument_type: "Kick", sample_type: "ONE_SHOT", key: "—", bpm: 140, tags: ["punchy", "808"] },
  { name: "Sub Killer 808", artist_name: "EKALI", genre: "Dubstep", instrument_type: "808", sample_type: "ONE_SHOT", key: "F", bpm: 150, tags: ["sub", "distorted"] },
  { name: "Aurora Pluck", artist_name: "JAWNS", genre: "Future Bass", instrument_type: "Pluck", sample_type: "LOOP", key: "A min", bpm: 150, tags: ["bright", "melodic"] },
  { name: "Trap Hats V3", artist_name: "MONTELL2099", genre: "Trap", instrument_type: "Hi-Hat", sample_type: "LOOP", key: "—", bpm: 144, tags: ["rolls", "crisp"] },
  { name: "Ghost Vocal Chop", artist_name: "KOMPANY", genre: "House", instrument_type: "Vocal Chop", sample_type: "LOOP", key: "G min", bpm: 126, tags: ["ethereal", "chopped"] },
  { name: "Liftoff Riser", artist_name: "DREZO", genre: "House", instrument_type: "Riser", sample_type: "ONE_SHOT", key: "—", bpm: 128, tags: ["build", "transition"] },
  { name: "Neon Lead", artist_name: "JUELZ", genre: "Synthwave", instrument_type: "Lead", sample_type: "LOOP", key: "C min", bpm: 118, tags: ["retro", "wide"] },
  { name: "Reese Growl", artist_name: "EKALI", genre: "Drum & Bass", instrument_type: "Synth Bass", sample_type: "LOOP", key: "E min", bpm: 174, tags: ["reese", "gritty"] },
  { name: "Warehouse Clap", artist_name: "KOMPANY", genre: "Techno", instrument_type: "Clap", sample_type: "ONE_SHOT", key: "—", bpm: 130, tags: ["roomy", "layered"] },
  { name: "Faded Riff", artist_name: "QUIX", genre: "Hip-Hop", instrument_type: "Electric Guitar", sample_type: "LOOP", key: "D min", bpm: 90, tags: ["lofi", "warm"] },
  { name: "Velvet Pad", artist_name: "JAWNS", genre: "Ambient", instrument_type: "Pad", sample_type: "LOOP", key: "A min", bpm: 100, tags: ["lush", "evolving"] },
  { name: "Anthem Hook", artist_name: "MONTELL2099", genre: "Pop", instrument_type: "Hook", sample_type: "LOOP", key: "F maj", bpm: 122, tags: ["catchy", "vocal"] },
  { name: "Concrete Impact", artist_name: "DREZO", genre: "Dubstep", instrument_type: "Impact", sample_type: "ONE_SHOT", key: "—", bpm: 150, tags: ["hit", "cinematic"] },
  { name: "Rhodes Dream", artist_name: "JUELZ", genre: "Lo-Fi", instrument_type: "Keys", sample_type: "LOOP", key: "B♭ maj", bpm: 84, tags: ["rhodes", "jazzy"] },
];

export const DEMO_SAMPLES: DemoSample[] = SEEDS.map((s, i) => ({
  ...s,
  id: `demo-${i + 1}`,
  creator_id: `demo-creator-${(s.artist_name || "gr").toLowerCase()}`,
  creator_avatar: null,
  preview_url: TEASERS[i % TEASERS.length],
  waveform_data: wave(i + 1),
}));

// Mirrors the real production catalog size (live count at time of writing) so
// the local preview reads truthfully. Production always uses the live total
// from /api/samples, so this only affects local dev.
export const DEMO_TOTAL = 8302;

import { prisma } from "@/lib/prisma";
import { getSampleDownloadCounts, getPresetDownloadCounts } from "@/lib/downloadCounts";

// Shared hydration for marketplace list responses: given a set of ids, load the
// rows, sign their previews in one batch and map them into the client shapes
// that SampleRow / PresetRow already consume. /api/samples and /api/presets
// build the same payload inline around their own filtering; this exists so
// id-first surfaces (recommendations) don't grow a third copy of the mapping.

const SYNTH_DISPLAY_NAMES: Record<string, string> = {
  SERUM: "Serum",
  SERUM_2: "Serum 2",
  ASTRA: "Astra",
  PHASE_PLANT: "Phase Plant",
  SPLICE: "Splice",
  VITAL: "Vital",
  SYLENTH1: "Sylenth1",
  MASSIVE: "Massive",
  BEAT_MAKER: "Beat Maker",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  BASS: "Bass",
  LEAD: "Lead",
  PAD: "Pad",
  PLUCK: "Pluck",
  FX: "FX",
  KEYS: "Keys",
  ARP: "Arp",
  SEQUENCE: "Sequence",
  OTHER: "Other",
};

// Previews live in a private bucket; the marketplace routes mint short-lived
// signed URLs for a page of items in a single Supabase call.
async function signPreviews(
  previewUrls: Array<string | null>
): Promise<Array<string | null>> {
  const paths = previewUrls.map((url) =>
    url?.startsWith("previews/") ? url.replace("previews/", "") : null
  );
  const valid = paths.filter((p): p is string => p !== null);
  if (valid.length === 0) return paths.map(() => null);

  const { createClient } = await import("@supabase/supabase-js");
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await serviceClient.storage
    .from("previews")
    .createSignedUrls(valid, 3600);

  const signed: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) signed[item.path] = item.signedUrl;
  }
  return paths.map((path) => (path ? signed[path] || null : null));
}

const CREATOR_SELECT = {
  select: { id: true, artistName: true, username: true, avatarUrl: true },
} as const;

/** Loads samples by id and returns them in the given id order. */
export async function loadSamplesByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const rows = await prisma.sample.findMany({
    where: { id: { in: ids } },
    include: { creator: CREATOR_SELECT },
  });

  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const [previewUrls, downloads] = await Promise.all([
    signPreviews(rows.map((s) => s.previewUrl)),
    getSampleDownloadCounts(rows.map((s) => s.id)),
  ]);

  return rows.map((s, i) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    creator_id: s.creatorId,
    artist_name: s.creator.artistName || s.creator.username || "Unknown",
    creator_avatar: s.creator.avatarUrl,
    genre: s.genre,
    instrument_type: s.instrumentType,
    sample_type: s.sampleType,
    key: s.key,
    bpm: s.bpm,
    credit_price: s.creditPrice,
    tags: s.tags,
    file_url: s.previewUrl || s.fileUrl,
    preview_url: previewUrls[i],
    cover_art_url: s.coverImageUrl,
    waveform_data: s.waveformData as number[] | null,
    average_rating: s.ratingAvg,
    total_ratings: s.ratingCount,
    total_purchases: s.downloadCount,
    total_downloads: downloads.get(s.id) ?? 0,
    created_date: s.createdAt.toISOString(),
  }));
}

/** Loads presets by id and returns them in the given id order. */
export async function loadPresetsByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const rows = await prisma.preset.findMany({
    where: { id: { in: ids } },
    include: { creator: CREATOR_SELECT },
  });

  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const [previewUrls, downloads] = await Promise.all([
    signPreviews(rows.map((p) => p.previewUrl)),
    getPresetDownloadCounts(rows.map((p) => p.id)),
  ]);

  return rows.map((p, i) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    creator_id: p.creatorId,
    artist_name: p.creator.artistName || p.creator.username || "Unknown",
    creator_avatar: p.creator.avatarUrl,
    synth_name: p.synthName,
    synth_display_name: SYNTH_DISPLAY_NAMES[p.synthName] || p.synthName,
    preset_category: p.presetCategory,
    category_display_name:
      CATEGORY_DISPLAY_NAMES[p.presetCategory] || p.presetCategory,
    genre: p.genre,
    tags: p.tags,
    credit_price: p.creditPrice,
    preview_url: previewUrls[i],
    cover_image_url: p.coverImageUrl,
    compatible_versions: p.compatibleVersions,
    is_init_preset: p.isInitPreset,
    average_rating: p.ratingAvg,
    total_ratings: p.ratingCount,
    total_downloads: downloads.get(p.id) ?? 0,
    created_date: p.createdAt.toISOString(),
  }));
}

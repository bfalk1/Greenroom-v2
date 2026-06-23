// Shared sample-metadata constants and the server-side update-payload builder.
// Used by the bulk-edit APIs (mod + creator) and the metadata UI.

export const GENRES = [
  "Hip Hop", "R&B", "Pop", "Electronic", "Trap", "Lo-Fi",
  "Rock", "Jazz", "Latin", "Afrobeats", "House", "Drill",
  "Ambient", "Indie", "Techno", "Classical", "Reggaeton",
  "Soul", "Funk", "Country",
];

export const INSTRUMENTS = [
  "Drums", "Bass", "Synth", "Guitar", "Piano", "Vocals",
  "FX", "Strings", "Brass", "Pad",
];

// Fields that can be bulk-edited on a sample. `name` is intentionally excluded
// (it's per-sample), and status/isActive are handled via explicit actions.
export const BULK_EDITABLE_FIELDS = [
  "genre",
  "instrumentType",
  "sampleType",
  "key",
  "bpm",
  "creditPrice",
  "tags",
] as const;

export type SampleUpdateData = Record<string, unknown>;

/**
 * Build a Prisma update payload from a loose metadata object, coercing and
 * validating each allowed field. Only fields that are present (!== undefined)
 * are included, so callers can send just the fields they want to change.
 * Returns `{ error }` if a provided value is invalid.
 */
export function buildSampleUpdateData(
  metadata: Record<string, unknown>
): { data: SampleUpdateData } | { error: string } {
  const data: SampleUpdateData = {};

  for (const field of BULK_EDITABLE_FIELDS) {
    const value = metadata[field];
    if (value === undefined) continue;

    if (field === "bpm") {
      if (value === null || value === "") {
        data.bpm = null;
      } else {
        const n = parseInt(String(value), 10);
        if (Number.isNaN(n)) return { error: "Invalid BPM" };
        data.bpm = n;
      }
    } else if (field === "creditPrice") {
      const n = parseInt(String(value), 10);
      if (Number.isNaN(n) || n < 1) return { error: "Invalid credit price" };
      data.creditPrice = n;
    } else if (field === "sampleType") {
      const v = String(value).toUpperCase();
      if (v !== "LOOP" && v !== "ONE_SHOT") return { error: "Invalid sample type" };
      data.sampleType = v;
    } else if (field === "tags") {
      if (Array.isArray(value)) {
        data.tags = value.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
      } else if (typeof value === "string") {
        data.tags = value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      }
    } else {
      // genre, instrumentType, key — plain strings
      data[field] = value;
    }
  }

  return { data };
}

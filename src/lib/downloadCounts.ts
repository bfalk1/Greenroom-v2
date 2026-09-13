import { prisma } from "@/lib/prisma";

// Real download counts, keyed by item id.
//
// Sample.downloadCount / Preset.downloadCount are PURCHASE counters — they are
// incremented in POST /api/purchases and never when a file is downloaded — so
// they cannot answer "how many times was this downloaded?". Actual downloads
// are rows in the `downloads` table, written by the /api/downloads/* routes,
// and unlike purchases they repeat for the same buyer.
//
// Use these helpers for anything exposed as `total_downloads` / labelled
// "downloads". Reading the column as a purchase count, or in `orderBy` as the
// popularity sort key, remains correct.

export async function getSampleDownloadCounts(
  sampleIds: string[]
): Promise<Map<string, number>> {
  if (sampleIds.length === 0) return new Map();

  const groups = await prisma.download.groupBy({
    by: ["sampleId"],
    where: { sampleId: { in: sampleIds } },
    _count: { _all: true },
  });

  return new Map(
    groups.flatMap((g) =>
      g.sampleId ? ([[g.sampleId, g._count._all]] as [string, number][]) : []
    )
  );
}

export async function getPresetDownloadCounts(
  presetIds: string[]
): Promise<Map<string, number>> {
  if (presetIds.length === 0) return new Map();

  const groups = await prisma.download.groupBy({
    by: ["presetId"],
    where: { presetId: { in: presetIds } },
    _count: { _all: true },
  });

  return new Map(
    groups.flatMap((g) =>
      g.presetId ? ([[g.presetId, g._count._all]] as [string, number][]) : []
    )
  );
}

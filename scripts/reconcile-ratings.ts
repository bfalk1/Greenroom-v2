/**
 * Reconcile denormalized rating columns (ratingAvg / ratingCount) on Sample and
 * Preset rows so they reflect ONLY real ratings — i.e. actual rows in the
 * `ratings` table. Any fabricated values (e.g. from the since-removed
 * apply-random-ratings.ts seed script, which wrote the columns without creating
 * Rating rows) get cleared back to 0, which the UI renders as "New".
 *
 * This is the exact aggregation POST /api/ratings already performs per-item, so
 * after this runs the columns stay correct going forward.
 *
 * Usage:
 *   npx tsx scripts/reconcile-ratings.ts            # dry run (read-only report)
 *   npx tsx scripts/reconcile-ratings.ts --apply    # write the corrections
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

// Prefer .env.local if present, otherwise fall back to .env.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function reconcile(kind: "sample" | "preset") {
  const idField = kind === "sample" ? "sampleId" : "presetId";

  // Real aggregates straight from the source of truth (ratings table).
  const agg = await prisma.rating.groupBy({
    by: [idField],
    where: { [idField]: { not: null } },
    _avg: { score: true },
    _count: { score: true },
  });

  const realById = new Map<string, { avg: number; count: number }>();
  let realRows = 0;
  for (const row of agg) {
    const id = (row as Record<string, unknown>)[idField] as string | null;
    if (!id) continue;
    const count = row._count.score;
    realById.set(id, { avg: row._avg.score ?? 0, count });
    realRows += count;
  }

  const model = kind === "sample" ? prisma.sample : prisma.preset;
  // @ts-expect-error — sample/preset share the count() shape we use here
  const total: number = await model.count();
  // @ts-expect-error — same shared shape
  const currentlyShowing: number = await model.count({ where: { ratingCount: { gt: 0 } } });

  console.log(`\n${kind.toUpperCase()}S`);
  console.log(`  total:                         ${total}`);
  console.log(`  currently showing a rating:    ${currentlyShowing}`);
  console.log(`  backed by real ratings:        ${realById.size} (${realRows} rating rows)`);
  console.log(`  will be reset to "New":        ${Math.max(0, currentlyShowing - realById.size)}`);

  if (!apply) return;

  // 1) Clear everything that currently shows a rating.
  // @ts-expect-error — shared updateMany shape
  await model.updateMany({ where: { ratingCount: { gt: 0 } }, data: { ratingAvg: 0, ratingCount: 0 } });

  // 2) Re-apply the genuine aggregates.
  for (const [id, { avg, count }] of realById) {
    // @ts-expect-error — shared update shape
    await model.update({ where: { id }, data: { ratingAvg: avg, ratingCount: count } });
  }

  console.log(`  ✓ applied — ${realById.size} kept, rest cleared`);
}

async function main() {
  console.log(apply ? "Reconciling ratings (APPLYING changes)…" : "Reconciling ratings (dry run — no writes)…");
  await reconcile("sample");
  await reconcile("preset");
  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write these corrections.");
  } else {
    console.log("\nDone.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

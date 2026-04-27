/**
 * Apply random 4-5 star ratings to all published samples and presets.
 *
 * Updates ratingAvg (float in [4.0, 5.0]) and ratingCount (int in [5, 50])
 * directly on Sample and Preset rows. Skips items that already have a
 * rating — re-running is safe and won't clobber real user ratings.
 *
 * Usage: npx tsx scripts/apply-random-ratings.ts
 * Or to force-overwrite: npx tsx scripts/apply-random-ratings.ts --force
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const prisma = new PrismaClient();

const force = process.argv.includes("--force");

function randomAvg(): number {
  // Skew slightly toward the middle of [4.0, 5.0] by averaging two rolls.
  const a = 4 + Math.random();
  const b = 4 + Math.random();
  return Math.round(((a + b) / 2) * 10) / 10;
}

function randomCount(): number {
  return Math.floor(Math.random() * 46) + 5; // [5, 50]
}

async function main() {
  const samples = await prisma.sample.findMany({
    where: force
      ? { status: "PUBLISHED", isActive: true }
      : { status: "PUBLISHED", isActive: true, ratingCount: 0 },
    select: { id: true, name: true },
  });

  console.log(`Updating ${samples.length} sample${samples.length === 1 ? "" : "s"}…`);

  for (const sample of samples) {
    const ratingAvg = randomAvg();
    const ratingCount = randomCount();
    await prisma.sample.update({
      where: { id: sample.id },
      data: { ratingAvg, ratingCount },
    });
    console.log(`  ${sample.name}: ${ratingAvg.toFixed(1)} (${ratingCount})`);
  }

  const presets = await prisma.preset.findMany({
    where: force
      ? { status: "PUBLISHED", isActive: true }
      : { status: "PUBLISHED", isActive: true, ratingCount: 0 },
    select: { id: true, name: true },
  });

  console.log(`\nUpdating ${presets.length} preset${presets.length === 1 ? "" : "s"}…`);

  for (const preset of presets) {
    const ratingAvg = randomAvg();
    const ratingCount = randomCount();
    await prisma.preset.update({
      where: { id: preset.id },
      data: { ratingAvg, ratingCount },
    });
    console.log(`  ${preset.name}: ${ratingAvg.toFixed(1)} (${ratingCount})`);
  }

  console.log(`\nDone. ${samples.length} samples, ${presets.length} presets.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

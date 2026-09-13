/**
 * Back-catalog AI-detection sweep: runs every published/in-review sample (and
 * every preset preview) through ACRCloud, resumably, and produces the
 * per-creator flag-rate report.
 *
 * The cron (/api/cron/ai-scan) processes the same audio_scans queue but only
 * ~48 scans/hour; this script drives the queue directly with a concurrency
 * pool for the one-time onboarding sweep (~4-5h for the full catalog).
 * Interrupt it any time — rows advance PENDING → SUBMITTED → COMPLETE /
 * UNSCANNABLE / ERROR and a re-run picks up where it stopped.
 *
 * Sub-3s WAVs are recorded UNSCANNABLE without spending a scan (calibrated
 * 2026-08-19: the detector returns no_music or junk under 3s). Every scan
 * also backfills Sample.durationMs.
 *
 * Invocation (both env files matter — DATABASE_URL is in .env, ACRCloud keys
 * in .env.local):
 *
 *   /opt/homebrew/opt/node@20/bin/node --env-file=.env --env-file=.env.local \
 *     node_modules/tsx/dist/cli.mjs scripts/backfill-ai-scans.ts [flags]
 *
 * Flags:
 *   (none)      dry summary: queue counts + what --enqueue/--process would do
 *   --enqueue   create missing PENDING rows for the whole catalog
 *   --process   work the queue (submit + poll + record)
 *   --limit=N   process at most N items this run (smoke tests)
 *   --yes       required when a --process run would submit >50 paid scans
 *   --report    per-creator flag-rate report (console + CSV)
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { isSafeStorageRef } from "../src/lib/storage";
import {
  acrSubmit,
  acrFetchResult,
  downloadStoredObject,
  isFlagged,
  parseWavDurationSec,
  MIN_SCANNABLE_SEC,
} from "../src/lib/aiScan";

const args = process.argv.slice(2);
const DO_ENQUEUE = args.includes("--enqueue");
const DO_PROCESS = args.includes("--process");
const DO_REPORT = args.includes("--report");
const YES = args.includes("--yes");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10) || Infinity;

const CONCURRENCY = 6;
const POLL_INTERVAL_MS = 8_000;
const MAX_POLLS = 40;
const SPEND_CONFIRM_THRESHOLD = 50;

async function enqueueMissing(dry: boolean): Promise<{ samples: number; presets: number }> {
  const samples = await prisma.sample.findMany({
    where: { status: { in: ["PUBLISHED", "REVIEW"] }, isActive: true, audioScan: null },
    select: { id: true },
  });
  const presets = await prisma.preset.findMany({
    where: { status: { in: ["PUBLISHED", "REVIEW"] }, isActive: true, audioScan: null, previewUrl: { not: null } },
    select: { id: true },
  });
  if (!dry) {
    if (samples.length) {
      await prisma.audioScan.createMany({
        data: samples.map((s) => ({ sampleId: s.id })),
        skipDuplicates: true,
      });
    }
    if (presets.length) {
      await prisma.audioScan.createMany({
        data: presets.map((p) => ({ presetId: p.id })),
        skipDuplicates: true,
      });
    }
  }
  return { samples: samples.length, presets: presets.length };
}

type QueueRow = {
  id: string;
  status: string;
  acrFileId: string | null;
  sampleId: string | null;
  attempts: number;
  sample: { fileUrl: string } | null;
  preset: { previewUrl: string | null } | null;
};

const counts = { completed: 0, flagged: 0, unscannable: 0, errors: 0, processed: 0 };

async function completeRow(row: QueueRow, acrFileId: string): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const result = await acrFetchResult(acrFileId);
    if (!result) continue;
    const flagged = isFlagged(result.verdict, result.aiProbability, result.durationSec);
    await prisma.audioScan.update({
      where: { id: row.id },
      data: {
        status: "COMPLETE",
        acrFileId,
        verdict: result.verdict,
        aiProbability: result.aiProbability,
        likelySource: result.likelySource,
        durationSec: result.durationSec,
        flagged,
        rawResult: result.raw as object,
        scannedAt: new Date(),
        error: null,
      },
    });
    if (row.sampleId && result.durationSec != null) {
      await prisma.sample
        .update({ where: { id: row.sampleId }, data: { durationMs: Math.round(result.durationSec * 1000) } })
        .catch(() => {});
    }
    counts.completed++;
    if (flagged) counts.flagged++;
    return;
  }
  await prisma.audioScan.update({
    where: { id: row.id },
    data: { status: "SUBMITTED", acrFileId, attempts: { increment: 1 } },
  });
  throw new Error(`no result after ${MAX_POLLS} polls (left SUBMITTED for a later run)`);
}

async function processRow(row: QueueRow): Promise<void> {
  if (row.status === "SUBMITTED" && row.acrFileId) {
    await completeRow(row, row.acrFileId);
    return;
  }

  const ref = row.sample ? row.sample.fileUrl : row.preset?.previewUrl ?? null;
  const bucket = row.sample ? "samples" : "previews";
  if (!ref || !isSafeStorageRef(ref, bucket)) {
    await prisma.audioScan.update({
      where: { id: row.id },
      data: { status: "ERROR", error: "unsafe or missing storage ref" },
    });
    counts.errors++;
    return;
  }

  const bytes = await downloadStoredObject(bucket, ref);
  const localDuration = parseWavDurationSec(bytes);
  if (localDuration !== null && localDuration < MIN_SCANNABLE_SEC) {
    await prisma.audioScan.update({
      where: { id: row.id },
      data: { status: "UNSCANNABLE", durationSec: localDuration, scannedAt: new Date() },
    });
    if (row.sampleId) {
      await prisma.sample
        .update({ where: { id: row.sampleId }, data: { durationMs: Math.round(localDuration * 1000) } })
        .catch(() => {});
    }
    counts.unscannable++;
    return;
  }

  const acrFileId = await acrSubmit(bytes, ref.split("/").pop() || "audio");
  await prisma.audioScan.update({
    where: { id: row.id },
    data: { status: "SUBMITTED", acrFileId, durationSec: localDuration },
  });
  await completeRow(row, acrFileId);
}

async function processQueue(): Promise<void> {
  // Crash recovery first: SUBMITTED rows already paid for their scan.
  const submitted = await prisma.audioScan.findMany({
    where: { status: "SUBMITTED" },
    select: { id: true, status: true, acrFileId: true, sampleId: true, attempts: true, sample: { select: { fileUrl: true } }, preset: { select: { previewUrl: true } } },
  });
  const pending = await prisma.audioScan.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, acrFileId: true, sampleId: true, attempts: true, sample: { select: { fileUrl: true } }, preset: { select: { previewUrl: true } } },
  });

  const queue: QueueRow[] = [...submitted, ...pending].slice(0, LIMIT);
  const paidScans = queue.filter((r) => r.status === "PENDING").length;
  console.log(`queue: ${submitted.length} SUBMITTED (recovery) + ${pending.length} PENDING; processing ${queue.length} this run`);
  if (paidScans > SPEND_CONFIRM_THRESHOLD && !YES) {
    console.error(
      `\nThis run would submit ~${paidScans} paid scans (≈ €${(paidScans * 0.1).toFixed(0)} at pack list price).` +
        `\nRe-run with --yes to confirm, or --limit=N for a smaller batch.`
    );
    process.exit(1);
  }

  let cursor = 0;
  const started = Date.now();
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const row = queue[cursor++];
      try {
        await processRow(row);
      } catch (err) {
        counts.errors++;
        console.error(`  ✗ ${row.id}: ${err instanceof Error ? err.message : err}`);
        await prisma.audioScan
          .update({
            where: { id: row.id },
            data: row.status === "PENDING" ? { status: "ERROR", error: String(err).slice(0, 500) } : {},
          })
          .catch(() => {});
      }
      counts.processed++;
      if (counts.processed % 25 === 0) {
        const rate = counts.processed / ((Date.now() - started) / 60000);
        console.log(
          `  ${counts.processed}/${queue.length} — ${counts.completed} scanned, ${counts.flagged} flagged, ` +
            `${counts.unscannable} unscannable, ${counts.errors} errors (${rate.toFixed(0)}/min)`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `\ndone: ${counts.completed} scanned, ${counts.flagged} flagged, ${counts.unscannable} unscannable, ${counts.errors} errors`
  );
}

async function report(): Promise<void> {
  const scans = await prisma.audioScan.findMany({
    where: { status: { in: ["COMPLETE", "UNSCANNABLE"] } },
    select: {
      verdict: true,
      aiProbability: true,
      likelySource: true,
      flagged: true,
      durationSec: true,
      status: true,
      sample: { select: { name: true, slug: true, creator: { select: { id: true, artistName: true, username: true, email: true } } } },
      preset: { select: { name: true, slug: true, creator: { select: { id: true, artistName: true, username: true, email: true } } } },
    },
  });

  type Row = { creator: string; total: number; scanned: number; flagged: number; flaggedItems: string[] };
  const byCreator = new Map<string, Row>();
  for (const s of scans) {
    const item = s.sample ?? s.preset;
    if (!item) continue;
    const c = item.creator;
    const key = c.artistName || c.username || c.email;
    const row = byCreator.get(c.id) ?? { creator: key, total: 0, scanned: 0, flagged: 0, flaggedItems: [] };
    row.total++;
    if (s.status === "COMPLETE") row.scanned++;
    if (s.flagged) {
      row.flagged++;
      row.flaggedItems.push(`${item.slug} (${Math.round(s.aiProbability ?? 0)}% ${s.likelySource ?? "?"})`);
    }
    byCreator.set(c.id, row);
  }

  const rows = [...byCreator.values()].sort(
    (a, b) => b.flagged / Math.max(b.scanned, 1) - a.flagged / Math.max(a.scanned, 1) || b.flagged - a.flagged
  );
  console.log(`\nPER-CREATOR FLAG RATES (${scans.length} scans, ${rows.length} creators)`);
  console.log("flag% | flagged/scanned | creator");
  for (const r of rows.slice(0, 25)) {
    const pct = r.scanned ? ((100 * r.flagged) / r.scanned).toFixed(0) : "0";
    console.log(`${pct.padStart(4)}% | ${String(r.flagged).padStart(4)}/${String(r.scanned).padEnd(5)} | ${r.creator}`);
  }

  const outDir = path.join(process.cwd(), "calibration-audio", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const csv = [
    "creator,total_items,scanned,flagged,flag_rate,flagged_items",
    ...rows.map((r) =>
      [
        JSON.stringify(r.creator),
        r.total,
        r.scanned,
        r.flagged,
        r.scanned ? (r.flagged / r.scanned).toFixed(3) : "0",
        JSON.stringify(r.flaggedItems.join("; ")),
      ].join(",")
    ),
  ].join("\n");
  const out = path.join(outDir, `sweep-report-${stamp}.csv`);
  fs.writeFileSync(out, csv);
  console.log(`\nwrote ${out}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — see the invocation in this file's header.");
    process.exit(1);
  }

  if (DO_REPORT) {
    await report();
    return;
  }

  const enqueue = await enqueueMissing(!DO_ENQUEUE);
  console.log(
    `${DO_ENQUEUE ? "enqueued" : "would enqueue"}: ${enqueue.samples} samples + ${enqueue.presets} preset previews`
  );

  if (DO_PROCESS) {
    await processQueue();
    await report();
  } else if (!DO_ENQUEUE) {
    const byStatus = await prisma.audioScan.groupBy({ by: ["status"], _count: { _all: true } });
    console.log("queue:", Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])));
    console.log("\ndry run — nothing changed. Use --enqueue then --process (add --yes for a full sweep).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

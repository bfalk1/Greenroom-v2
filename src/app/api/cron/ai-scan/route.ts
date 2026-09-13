import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSafeStorageRef } from "@/lib/storage";
import {
  acrSubmit,
  acrFetchResult,
  downloadStoredObject,
  isFlagged,
  parseWavDurationSec,
  MIN_SCANNABLE_SEC,
} from "@/lib/aiScan";

export const maxDuration = 300;

// Verify cron secret to prevent unauthorized access. FAIL CLOSED: an
// unconfigured secret rejects every request (same policy as monthly-payouts).
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured — refusing to run");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

// Every 15 min: two-phase processor for audio_scans rows. Collect first
// (results for previously SUBMITTED scans — cheap GETs), then submit a batch
// of PENDING ones (download from storage → skip sub-3s WAVs → upload to
// ACRCloud). No long polling inside the function: a scan submitted on this
// run is collected on a later run. Rows are enqueued by the sample/preset
// create routes and by scripts/backfill-ai-scans.ts — this cron never
// enqueues, so scan spend stays under explicit control.
const SUBMIT_BATCH = 12;
const COLLECT_BATCH = 40;
// A scan normally finishes in ~15s; if it's still pending after this many
// collect attempts (multiple hours of cron runs), give up.
const MAX_COLLECT_ATTEMPTS = 60;

async function collectOne(scan: { id: string; acrFileId: string | null; sampleId: string | null; attempts: number }): Promise<"done" | "pending" | "error"> {
  if (!scan.acrFileId) {
    await prisma.audioScan.update({
      where: { id: scan.id },
      data: { status: "ERROR", error: "SUBMITTED row has no acrFileId" },
    });
    return "error";
  }
  const result = await acrFetchResult(scan.acrFileId);
  if (!result) {
    const attempts = scan.attempts + 1;
    await prisma.audioScan.update({
      where: { id: scan.id },
      data:
        attempts > MAX_COLLECT_ATTEMPTS
          ? { status: "ERROR", error: `no result after ${attempts} polls`, attempts }
          : { attempts },
    });
    return attempts > MAX_COLLECT_ATTEMPTS ? "error" : "pending";
  }

  const flagged = isFlagged(result.verdict, result.aiProbability, result.durationSec);
  await prisma.audioScan.update({
    where: { id: scan.id },
    data: {
      status: "COMPLETE",
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

  // Backfill the sample's long-empty duration column from ACRCloud's
  // authoritative measurement (presets have no duration column).
  if (scan.sampleId && result.durationSec != null) {
    await prisma.sample
      .update({
        where: { id: scan.sampleId },
        data: { durationMs: Math.round(result.durationSec * 1000) },
      })
      .catch(() => {}); // sample may have been deleted; scan row cascades separately
  }
  return "done";
}

async function submitOne(scan: {
  id: string;
  sampleId: string | null;
  sample: { fileUrl: string } | null;
  preset: { previewUrl: string | null } | null;
}): Promise<"submitted" | "unscannable" | "error"> {
  // Samples scan the full WAV; presets scan the audio preview (the preset
  // file itself is a synth patch). Refs are client-supplied and stored
  // verbatim, so re-validate before handing them to the service-role client.
  const ref = scan.sample ? scan.sample.fileUrl : scan.preset?.previewUrl ?? null;
  const bucket = scan.sample ? "samples" : "previews";
  if (!ref || !isSafeStorageRef(ref, bucket)) {
    await prisma.audioScan.update({
      where: { id: scan.id },
      data: { status: "ERROR", error: `unsafe or missing storage ref` },
    });
    return "error";
  }

  const bytes = await downloadStoredObject(bucket, ref);

  // Sub-3s clips are unscannable (calibration: no_music or false positives) —
  // record the duration, skip the paid scan. Only WAV headers are parsed;
  // preset previews (MP3) go straight to ACRCloud, whose measured duration
  // still gates the flag via isFlagged.
  const localDuration = parseWavDurationSec(bytes);
  if (localDuration !== null && localDuration < MIN_SCANNABLE_SEC) {
    await prisma.audioScan.update({
      where: { id: scan.id },
      data: { status: "UNSCANNABLE", durationSec: localDuration, scannedAt: new Date() },
    });
    if (scan.sampleId) {
      await prisma.sample
        .update({
          where: { id: scan.sampleId },
          data: { durationMs: Math.round(localDuration * 1000) },
        })
        .catch(() => {});
    }
    return "unscannable";
  }

  const filename = ref.split("/").pop() || "audio";
  const acrFileId = await acrSubmit(bytes, filename);
  await prisma.audioScan.update({
    where: { id: scan.id },
    data: { status: "SUBMITTED", acrFileId, durationSec: localDuration, error: null },
  });
  return "submitted";
}

async function runSweep(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idle harmlessly (leave the queue untouched) until the ACRCloud env vars
  // reach Vercel — otherwise every PENDING row would burn to ERROR on deploy.
  if (!process.env.ACRCLOUD_BEARER_TOKEN || !process.env.ACRCLOUD_CONTAINER_ID) {
    console.warn("ai-scan cron idle: ACRCLOUD_BEARER_TOKEN / ACRCLOUD_CONTAINER_ID not configured");
    return NextResponse.json({ ok: true, idle: "ACRCloud env not configured" });
  }

  const counts = { collected: 0, stillPending: 0, submitted: 0, unscannable: 0, errors: 0 };
  try {
    const toCollect = await prisma.audioScan.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { updatedAt: "asc" },
      take: COLLECT_BATCH,
      select: { id: true, acrFileId: true, sampleId: true, attempts: true },
    });
    for (const scan of toCollect) {
      try {
        const r = await collectOne(scan);
        if (r === "done") counts.collected++;
        else if (r === "pending") counts.stillPending++;
        else counts.errors++;
      } catch (err) {
        counts.errors++;
        console.error(`ai-scan collect failed for ${scan.id}:`, err);
        await prisma.audioScan
          .update({ where: { id: scan.id }, data: { attempts: { increment: 1 } } })
          .catch(() => {});
      }
    }

    const toSubmit = await prisma.audioScan.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: SUBMIT_BATCH,
      select: {
        id: true,
        sampleId: true,
        sample: { select: { fileUrl: true } },
        preset: { select: { previewUrl: true } },
      },
    });
    for (const scan of toSubmit) {
      try {
        const r = await submitOne(scan);
        if (r === "submitted") counts.submitted++;
        else if (r === "unscannable") counts.unscannable++;
        else counts.errors++;
      } catch (err) {
        counts.errors++;
        console.error(`ai-scan submit failed for ${scan.id}:`, err);
        await prisma.audioScan
          .update({
            where: { id: scan.id },
            data: { status: "ERROR", error: err instanceof Error ? err.message.slice(0, 500) : "submit failed" },
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    console.error("ai-scan cron failed:", error);
    return NextResponse.json({ error: "Cron failed", ...counts }, { status: 500 });
  }
}

// Vercel cron invokes with GET (Authorization: Bearer CRON_SECRET);
// POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return runSweep(request);
}

export async function POST(request: NextRequest) {
  return runSweep(request);
}

/**
 * Greenroom Preview Worker
 * 
 * Runs on Railway, generates MP3 previews for samples missing them.
 * Previews are 30 seconds max, 128kbps - safe to expose publicly.
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import cron from "node-cron";

const execAsync = promisify(exec);

// Environment variables (set in Railway)
const {
  DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CRON_SCHEDULE = "*/5 * * * *", // Default: every 5 minutes
} = process.env;

if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const prisma = new PrismaClient();

const PREVIEW_DURATION = 30;
const PREVIEW_BITRATE = "128k";
const PREVIEW_BUCKET = "previews";

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === PREVIEW_BUCKET);
  
  if (!exists) {
    console.log(`Creating bucket: ${PREVIEW_BUCKET}`);
    const { error } = await supabase.storage.createBucket(PREVIEW_BUCKET, {
      public: false,
    });
    if (error && !error.message.includes("already exists")) {
      console.error("Failed to create bucket:", error);
      throw error;
    }
  }
}

async function generatePreview(inputPath, outputPath) {
  const cmd = `ffmpeg -y -i "${inputPath}" -t ${PREVIEW_DURATION} -b:a ${PREVIEW_BITRATE} -ar 44100 -ac 2 "${outputPath}"`;
  await execAsync(cmd);
}

async function downloadFile(storagePath, localPath) {
  const parts = storagePath.split("/");
  const bucket = parts[0];
  const filePath = parts.slice(1).join("/");
  
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  
  if (error || !data) {
    throw new Error(`Failed to download ${storagePath}: ${error?.message}`);
  }
  
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
}

async function uploadPreview(localPath, remotePath) {
  const fileBuffer = fs.readFileSync(localPath);
  
  const { error } = await supabase.storage.from(PREVIEW_BUCKET).upload(remotePath, fileBuffer, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  
  if (error) {
    throw new Error(`Failed to upload preview: ${error.message}`);
  }
  
  return `${PREVIEW_BUCKET}/${remotePath}`;
}

async function processSample(sample) {
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `${sample.id}_input.wav`);
  const outputFile = path.join(tmpDir, `${sample.id}_preview.mp3`);
  
  try {
    if (sample.previewUrl && sample.previewUrl.startsWith(PREVIEW_BUCKET)) {
      return { status: "skipped", reason: "already has preview" };
    }
    
    console.log(`  ⬇️  Downloading: ${sample.name}`);
    await downloadFile(sample.fileUrl, inputFile);
    
    console.log(`  🔧 Generating preview...`);
    await generatePreview(inputFile, outputFile);
    
    const stats = fs.statSync(outputFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`  ⬆️  Uploading preview (${sizeMB} MB)...`);
    const previewPath = `${sample.id}.mp3`;
    const previewUrl = await uploadPreview(outputFile, previewPath);
    
    await prisma.sample.update({
      where: { id: sample.id },
      data: { previewUrl },
    });
    
    console.log(`  ✅ Done: ${sample.name}`);
    return { status: "processed" };
  } catch (error) {
    console.error(`  ❌ Failed: ${sample.name}`, error.message);
    return { status: "failed", error: error.message };
  } finally {
    if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  }
}

async function runPreviewGeneration() {
  console.log(`\n[${new Date().toISOString()}] Starting preview generation...`);
  
  try {
    await ensureBucketExists();
    
    // Find published samples without previews
    const samples = await prisma.sample.findMany({
      where: {
        status: "PUBLISHED",
        isActive: true,
        OR: [
          { previewUrl: null },
          { previewUrl: "" },
          { previewUrl: { startsWith: "samples/" } }, // Points to full file, needs preview
        ],
      },
      select: {
        id: true,
        name: true,
        fileUrl: true,
        previewUrl: true,
      },
      take: 10, // Process in batches
    });
    
    if (samples.length === 0) {
      console.log("No samples need previews");
      return;
    }
    
    console.log(`Found ${samples.length} samples needing previews\n`);
    
    let processed = 0, skipped = 0, failed = 0;
    
    for (const sample of samples) {
      const result = await processSample(sample);
      if (result.status === "processed") processed++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    }
    
    console.log(`\n📊 Summary: ${processed} processed, ${skipped} skipped, ${failed} failed`);
  } catch (error) {
    console.error("Preview generation error:", error);
  }
}

// Run immediately on startup
console.log("🎵 Greenroom Preview Worker starting...");
console.log(`Schedule: ${CRON_SCHEDULE}`);

runPreviewGeneration();

// Then run on schedule
cron.schedule(CRON_SCHEDULE, runPreviewGeneration);

// Keep the process alive
console.log("Worker running. Press Ctrl+C to stop.");

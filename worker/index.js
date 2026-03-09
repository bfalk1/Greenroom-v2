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

// Debug mode - set DEBUG=true in Railway to enable verbose logging
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

function debug(...args) {
  if (DEBUG) {
    console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);
  }
}

function debugObj(label, obj) {
  if (DEBUG) {
    console.log(`[DEBUG ${new Date().toISOString()}] ${label}:`, JSON.stringify(obj, null, 2));
  }
}

// Environment variables (set in Railway)
const {
  DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CRON_SCHEDULE = "*/5 * * * *", // Default: every 5 minutes
} = process.env;

debug("Environment check:", {
  hasDbUrl: !!DATABASE_URL,
  dbUrlPrefix: DATABASE_URL?.substring(0, 30) + "...",
  supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
  cronSchedule: CRON_SCHEDULE,
  nodeEnv: process.env.NODE_ENV,
  debugMode: DEBUG,
});

if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables");
  console.error({
    DATABASE_URL: DATABASE_URL ? "✓ set" : "✗ missing",
    NEXT_PUBLIC_SUPABASE_URL: NEXT_PUBLIC_SUPABASE_URL ? "✓ set" : "✗ missing",
    SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY ? "✓ set" : "✗ missing",
  });
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const prisma = new PrismaClient();

const PREVIEW_DURATION = 30;
const PREVIEW_BITRATE = "128k";
const PREVIEW_BUCKET = "previews";

async function ensureBucketExists() {
  debug("Checking if bucket exists:", PREVIEW_BUCKET);
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error("Failed to list buckets:", listError);
    debug("listBuckets error details:", listError);
  }
  
  debugObj("Available buckets", buckets?.map(b => b.name));
  const exists = buckets?.some((b) => b.name === PREVIEW_BUCKET);
  debug("Bucket exists:", exists);
  
  if (!exists) {
    console.log(`Creating bucket: ${PREVIEW_BUCKET}`);
    const { error } = await supabase.storage.createBucket(PREVIEW_BUCKET, {
      public: false,
    });
    if (error && !error.message.includes("already exists")) {
      console.error("Failed to create bucket:", error);
      debug("createBucket error details:", error);
      throw error;
    }
    debug("Bucket created successfully");
  }
}

async function generatePreview(inputPath, outputPath) {
  const cmd = `ffmpeg -y -i "${inputPath}" -t ${PREVIEW_DURATION} -b:a ${PREVIEW_BITRATE} -ar 44100 -ac 2 "${outputPath}"`;
  debug("ffmpeg command:", cmd);
  
  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(cmd);
    const duration = Date.now() - startTime;
    debug(`ffmpeg completed in ${duration}ms`);
    if (stderr) debug("ffmpeg stderr:", stderr.substring(0, 500));
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`ffmpeg failed after ${duration}ms:`, error.message);
    debug("ffmpeg error details:", { 
      code: error.code, 
      signal: error.signal,
      stderr: error.stderr?.substring(0, 1000) 
    });
    throw error;
  }
}

async function downloadFile(storagePath, localPath) {
  const parts = storagePath.split("/");
  const bucket = parts[0];
  const filePath = parts.slice(1).join("/");
  
  debug("Downloading file:", { storagePath, bucket, filePath, localPath });
  const startTime = Date.now();
  
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  
  if (error || !data) {
    console.error(`Failed to download ${storagePath}:`, error?.message);
    debug("Download error details:", error);
    throw new Error(`Failed to download ${storagePath}: ${error?.message}`);
  }
  
  const buffer = Buffer.from(await data.arrayBuffer());
  const duration = Date.now() - startTime;
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  
  debug(`Downloaded ${sizeMB} MB in ${duration}ms (${(buffer.length / duration * 1000 / 1024 / 1024).toFixed(2)} MB/s)`);
  
  fs.writeFileSync(localPath, buffer);
  debug("Written to:", localPath);
}

async function uploadPreview(localPath, remotePath) {
  const fileBuffer = fs.readFileSync(localPath);
  const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
  
  debug("Uploading preview:", { localPath, remotePath, sizeMB: `${sizeMB} MB` });
  const startTime = Date.now();
  
  const { data, error } = await supabase.storage.from(PREVIEW_BUCKET).upload(remotePath, fileBuffer, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  
  const duration = Date.now() - startTime;
  
  if (error) {
    console.error(`Failed to upload preview after ${duration}ms:`, error.message);
    debug("Upload error details:", error);
    throw new Error(`Failed to upload preview: ${error.message}`);
  }
  
  debug(`Uploaded in ${duration}ms (${(fileBuffer.length / duration * 1000 / 1024 / 1024).toFixed(2)} MB/s)`);
  debugObj("Upload response", data);
  
  return `${PREVIEW_BUCKET}/${remotePath}`;
}

async function processSample(sample) {
  const tmpDir = os.tmpdir();
  
  // Preserve original extension from fileUrl - ffmpeg needs correct extension to detect format
  const originalExt = path.extname(sample.fileUrl) || '.wav';
  const inputFile = path.join(tmpDir, `${sample.id}_input${originalExt}`);
  const outputFile = path.join(tmpDir, `${sample.id}_preview.mp3`);
  const sampleStartTime = Date.now();
  
  debug("Processing sample:", { 
    id: sample.id, 
    name: sample.name, 
    fileUrl: sample.fileUrl,
    originalExt,
    previewUrl: sample.previewUrl,
    tmpDir,
    inputFile,
    outputFile
  });
  
  try {
    if (sample.previewUrl && sample.previewUrl.startsWith(PREVIEW_BUCKET)) {
      debug("Skipping - already has preview in correct bucket");
      return { status: "skipped", reason: "already has preview" };
    }
    
    console.log(`  ⬇️  Downloading: ${sample.name}`);
    await downloadFile(sample.fileUrl, inputFile);
    
    // Verify downloaded file
    if (fs.existsSync(inputFile)) {
      const inputStats = fs.statSync(inputFile);
      // Read first 16 bytes to check file signature
      const fd = fs.openSync(inputFile, 'r');
      const headerBuf = Buffer.alloc(16);
      fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);
      const headerHex = headerBuf.toString('hex');
      const headerAscii = headerBuf.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
      debug("Input file stats:", { 
        size: inputStats.size, 
        path: inputFile,
        headerHex,
        headerAscii,
        // Common signatures: RIFF=WAV, ID3/ff fb=MP3, fLaC=FLAC, FORM=AIFF
        detectedType: headerAscii.startsWith('RIFF') ? 'WAV' :
                      headerAscii.startsWith('ID3') || headerHex.startsWith('fffb') || headerHex.startsWith('fff3') ? 'MP3' :
                      headerAscii.startsWith('fLaC') ? 'FLAC' :
                      headerAscii.startsWith('FORM') ? 'AIFF' :
                      headerAscii.startsWith('OggS') ? 'OGG' :
                      'UNKNOWN'
      });
    } else {
      debug("WARNING: Input file does not exist after download!");
    }
    
    console.log(`  🔧 Generating preview...`);
    await generatePreview(inputFile, outputFile);
    
    // Verify output file
    if (!fs.existsSync(outputFile)) {
      throw new Error("Output file was not created by ffmpeg");
    }
    
    const stats = fs.statSync(outputFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    debug("Output file stats:", { size: stats.size, sizeMB: `${sizeMB} MB` });
    
    console.log(`  ⬆️  Uploading preview (${sizeMB} MB)...`);
    const previewPath = `${sample.id}.mp3`;
    const previewUrl = await uploadPreview(outputFile, previewPath);
    
    debug("Updating database with previewUrl:", previewUrl);
    await prisma.sample.update({
      where: { id: sample.id },
      data: { previewUrl },
    });
    
    const totalDuration = Date.now() - sampleStartTime;
    console.log(`  ✅ Done: ${sample.name} (${totalDuration}ms total)`);
    debug("Sample processed successfully:", { id: sample.id, totalDuration });
    
    return { status: "processed" };
  } catch (error) {
    const totalDuration = Date.now() - sampleStartTime;
    console.error(`  ❌ Failed: ${sample.name} after ${totalDuration}ms -`, error.message);
    debug("Sample processing error:", { 
      id: sample.id, 
      error: error.message, 
      stack: error.stack,
      totalDuration 
    });
    return { status: "failed", error: error.message };
  } finally {
    debug("Cleaning up temp files...");
    if (fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
      debug("Deleted:", inputFile);
    }
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
      debug("Deleted:", outputFile);
    }
  }
}

async function runPreviewGeneration() {
  const runStartTime = Date.now();
  console.log(`\n[${new Date().toISOString()}] Starting preview generation...`);
  debug("Run started");
  
  try {
    await ensureBucketExists();
    
    // Find published samples without previews
    debug("Querying for samples needing previews...");
    const queryStartTime = Date.now();
    
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
    
    const queryDuration = Date.now() - queryStartTime;
    debug(`Query completed in ${queryDuration}ms, found ${samples.length} samples`);
    
    if (samples.length === 0) {
      console.log("No samples need previews");
      debug("Run completed (no work to do)");
      return;
    }
    
    console.log(`Found ${samples.length} samples needing previews\n`);
    debugObj("Samples to process", samples.map(s => ({ id: s.id, name: s.name, previewUrl: s.previewUrl })));
    
    let processed = 0, skipped = 0, failed = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      debug(`\n--- Processing sample ${i + 1}/${samples.length} ---`);
      const result = await processSample(sample);
      if (result.status === "processed") processed++;
      else if (result.status === "skipped") skipped++;
      else failed++;
    }
    
    const totalDuration = Date.now() - runStartTime;
    console.log(`\n📊 Summary: ${processed} processed, ${skipped} skipped, ${failed} failed (total: ${totalDuration}ms)`);
    debug("Run completed:", { processed, skipped, failed, totalDuration });
  } catch (error) {
    const totalDuration = Date.now() - runStartTime;
    console.error("Preview generation error:", error);
    debug("Run failed after ${totalDuration}ms:", { 
      error: error.message, 
      stack: error.stack 
    });
  }
}

// Run immediately on startup
console.log("🎵 Greenroom Preview Worker starting...");
console.log(`Schedule: ${CRON_SCHEDULE}`);
console.log(`Debug mode: ${DEBUG ? "ENABLED" : "disabled"}`);

debug("System info:", {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  pid: process.pid,
  cwd: process.cwd(),
  tmpdir: os.tmpdir(),
  freemem: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
  totalmem: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
});

// Check ffmpeg availability
execAsync("ffmpeg -version")
  .then(({ stdout }) => {
    const version = stdout.split("\n")[0];
    console.log(`ffmpeg: ${version}`);
    debug("ffmpeg full version info:", stdout.substring(0, 500));
  })
  .catch((err) => {
    console.error("⚠️ ffmpeg not found:", err.message);
    debug("ffmpeg check failed:", err);
  });

runPreviewGeneration();

// Then run on schedule
cron.schedule(CRON_SCHEDULE, () => {
  debug("Cron trigger fired");
  runPreviewGeneration();
});

// Keep the process alive
console.log("Worker running. Press Ctrl+C to stop.");

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  debug("SIGTERM received");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  debug("SIGINT received");
  process.exit(0);
});

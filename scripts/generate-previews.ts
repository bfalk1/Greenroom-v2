/**
 * Generate preview files for all samples
 * 
 * Previews are:
 * - 30 seconds max (or full length if shorter)
 * - 128kbps MP3 (not lossless WAV)
 * 
 * This makes them unusable for production while still
 * letting users hear what they're buying.
 * 
 * Usage: npx tsx scripts/generate-previews.ts
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// Load env
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const prisma = new PrismaClient();

const PREVIEW_DURATION = 30; // seconds
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
    if (error) {
      console.error("Failed to create bucket:", error);
      throw error;
    }
  }
}

const FFMPEG = "/usr/local/bin/ffmpeg";

async function generatePreview(
  inputPath: string,
  outputPath: string
): Promise<void> {
  // Generate preview: MP3, 128kbps, max 30 seconds
  // Try multiple strategies to handle various WAV formats including 32-bit float
  
  // Probe the file first to understand what we're dealing with
  try {
    const probeCmd = `ffprobe -v error -show_entries stream=codec_name,sample_fmt,sample_rate,channels -of json "${inputPath}"`;
    const { stdout: probeOutput } = await execAsync(probeCmd);
    console.log(`    🔍 Probe result: ${probeOutput.replace(/\n/g, ' ')}`);
  } catch {
    console.log(`    ⚠️  Probe failed (continuing anyway)`);
  }
  
  const strategies = [
    // Strategy 1: Standard conversion with aformat filter for 32-bit float WAV
    `${FFMPEG} -y -i "${inputPath}" -af "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo" -t ${PREVIEW_DURATION} -b:a ${PREVIEW_BITRATE} "${outputPath}"`,
    
    // Strategy 2: Force WAV demuxer with ignore_unknown for non-standard WAV chunks
    `${FFMPEG} -y -f wav -ignore_unknown -i "${inputPath}" -af "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo" -t ${PREVIEW_DURATION} -b:a ${PREVIEW_BITRATE} "${outputPath}"`,
    
    // Strategy 3: Try as raw 32-bit float PCM (common for DAW exports)
    `${FFMPEG} -y -f f32le -ar 44100 -ac 2 -i "${inputPath}" -t ${PREVIEW_DURATION} -b:a ${PREVIEW_BITRATE} "${outputPath}"`,
  ];
  
  let lastError: Error | null = null;
  
  for (let i = 0; i < strategies.length; i++) {
    const cmd = strategies[i];
    
    try {
      await execAsync(cmd);
      
      // Verify output was created and has content
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          console.log(`    🎵 Preview generated using strategy ${i + 1}`);
          return; // Success!
        }
      }
    } catch (error) {
      lastError = error as Error;
      console.log(`    ⚠️  Strategy ${i + 1} failed, trying next...`);
    }
  }
  
  // All strategies failed
  throw lastError || new Error("All ffmpeg strategies failed");
}

async function downloadFile(storagePath: string, localPath: string): Promise<void> {
  const parts = storagePath.split("/");
  const bucket = parts[0];
  const filePath = parts.slice(1).join("/");
  
  console.log(`    📂 Bucket: ${bucket}, Path: ${filePath}`);
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(filePath);
  
  if (error || !data) {
    throw new Error(`Failed to download ${storagePath}: ${error?.message}`);
  }
  
  const buffer = Buffer.from(await data.arrayBuffer());
  
  // Debug: check what we actually got
  console.log(`    📦 Downloaded ${buffer.length} bytes`);
  
  // WAV files start with "RIFF", AIFF with "FORM", MP3 with ID3 or 0xFF
  const header = buffer.slice(0, 4).toString();
  if (!header.startsWith('RIFF') && !header.startsWith('FORM') && !header.startsWith('ID3') && buffer[0] !== 0xFF) {
    console.log(`    ⚠️  Not a valid audio file! Header: ${buffer.slice(0, 4).toString('hex')}`);
    console.log(`    ⚠️  First 200 chars: ${buffer.slice(0, 200).toString().replace(/\n/g, '\\n')}`);
    throw new Error(`Downloaded file is not valid audio (got ${header.startsWith('<') ? 'HTML' : 'unknown format'})`);
  }
  
  fs.writeFileSync(localPath, buffer);
}

async function uploadPreview(
  localPath: string,
  remotePath: string
): Promise<string> {
  const fileBuffer = fs.readFileSync(localPath);
  
  const { error } = await supabase.storage
    .from(PREVIEW_BUCKET)
    .upload(remotePath, fileBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });
  
  if (error) {
    throw new Error(`Failed to upload preview: ${error.message}`);
  }
  
  return `${PREVIEW_BUCKET}/${remotePath}`;
}

async function processSample(sample: {
  id: string;
  name: string;
  fileUrl: string;
  previewUrl: string | null;
}): Promise<boolean> {
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `${sample.id}_input.wav`);
  const outputFile = path.join(tmpDir, `${sample.id}_preview.mp3`);
  
  try {
    // Skip if already has a different preview URL (not same as fileUrl)
    if (sample.previewUrl && sample.previewUrl !== sample.fileUrl && sample.previewUrl.startsWith(PREVIEW_BUCKET)) {
      console.log(`  ⏭️  ${sample.name} - already has preview`);
      return false;
    }
    
    console.log(`  ⬇️  Downloading: ${sample.name}`);
    await downloadFile(sample.fileUrl, inputFile);
    
    console.log(`  🔧 Generating preview...`);
    await generatePreview(inputFile, outputFile);
    
    // Get file size for logging
    const stats = fs.statSync(outputFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`  ⬆️  Uploading preview (${sizeMB} MB)...`);
    const previewPath = `${sample.id}.mp3`;
    const previewUrl = await uploadPreview(outputFile, previewPath);
    
    // Update database
    await prisma.sample.update({
      where: { id: sample.id },
      data: { previewUrl },
    });
    
    console.log(`  ✅ Done: ${sample.name}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed: ${sample.name}`, error);
    return false;
  } finally {
    // Cleanup
    if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  }
}

async function main() {
  console.log("🎵 Greenroom Preview Generator\n");
  
  // Ensure preview bucket exists
  await ensureBucketExists();
  
  // Get all published samples
  const samples = await prisma.sample.findMany({
    where: {
      status: "PUBLISHED",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      fileUrl: true,
      previewUrl: true,
    },
  });
  
  console.log(`Found ${samples.length} samples to process\n`);
  
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const sample of samples) {
    const result = await processSample(sample);
    if (result) {
      processed++;
    } else {
      skipped++;
    }
  }
  
  console.log("\n📊 Summary:");
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

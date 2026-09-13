-- AI-audio detection results (ACRCloud), one row per sample/preset.
-- Applied to prod via scripts/apply-audio-scan-migration.ts — NOT `migrate deploy`
-- (this project's prod migration history has diverged; see that script's header).

-- CreateEnum
CREATE TYPE "AudioScanStatus" AS ENUM ('PENDING', 'SUBMITTED', 'COMPLETE', 'UNSCANNABLE', 'ERROR');

-- CreateTable
CREATE TABLE "audio_scans" (
    "id" UUID NOT NULL,
    "sample_id" UUID,
    "preset_id" UUID,
    "status" "AudioScanStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'acrcloud',
    "acr_file_id" TEXT,
    "verdict" TEXT,
    "ai_probability" DOUBLE PRECISION,
    "likely_source" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "duration_sec" DOUBLE PRECISION,
    "raw_result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scanned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_scans_sample_id_key" ON "audio_scans"("sample_id");

-- CreateIndex
CREATE UNIQUE INDEX "audio_scans_preset_id_key" ON "audio_scans"("preset_id");

-- CreateIndex
CREATE INDEX "audio_scans_status_idx" ON "audio_scans"("status");

-- CreateIndex
CREATE INDEX "audio_scans_flagged_idx" ON "audio_scans"("flagged");

-- AddForeignKey
ALTER TABLE "audio_scans" ADD CONSTRAINT "audio_scans_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_scans" ADD CONSTRAINT "audio_scans_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

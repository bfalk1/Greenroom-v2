-- For You attribution: every served list (impressions) and the purchases /
-- favorites made from one (outcomes). Step 1 of learning from outcomes.
-- Applied to prod via scripts/apply-recommendation-tracking-migration.ts — NOT
-- `migrate deploy` (this project's prod migration history has diverged).

-- CreateEnum
CREATE TYPE "RecommendationOutcomeKind" AS ENUM ('PURCHASE', 'FAVORITE');

-- CreateTable
CREATE TABLE "recommendation_impressions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ranker" TEXT NOT NULL,
    "cold" BOOLEAN NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sample_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "sample_scores" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_similar_buyers" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_genre" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_instrument" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_creator" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_rating" REAL[] DEFAULT ARRAY[]::REAL[],
    "sample_popularity" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "preset_scores" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_similar_buyers" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_genre" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_category" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_creator" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_rating" REAL[] DEFAULT ARRAY[]::REAL[],
    "preset_popularity" REAL[] DEFAULT ARRAY[]::REAL[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_outcomes" (
    "id" UUID NOT NULL,
    "impression_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sample_id" UUID,
    "preset_id" UUID,
    "kind" "RecommendationOutcomeKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_impressions_user_id_created_at_idx" ON "recommendation_impressions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "recommendation_impressions_created_at_idx" ON "recommendation_impressions"("created_at");

-- CreateIndex
CREATE INDEX "recommendation_outcomes_user_id_created_at_idx" ON "recommendation_outcomes"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "recommendation_outcomes_sample_id_idx" ON "recommendation_outcomes"("sample_id");

-- CreateIndex
CREATE INDEX "recommendation_outcomes_preset_id_idx" ON "recommendation_outcomes"("preset_id");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_outcomes_impression_id_kind_sample_id_key" ON "recommendation_outcomes"("impression_id", "kind", "sample_id");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_outcomes_impression_id_kind_preset_id_key" ON "recommendation_outcomes"("impression_id", "kind", "preset_id");

-- AddForeignKey
ALTER TABLE "recommendation_impressions" ADD CONSTRAINT "recommendation_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_outcomes" ADD CONSTRAINT "recommendation_outcomes_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "recommendation_impressions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_outcomes" ADD CONSTRAINT "recommendation_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_outcomes" ADD CONSTRAINT "recommendation_outcomes_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_outcomes" ADD CONSTRAINT "recommendation_outcomes_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


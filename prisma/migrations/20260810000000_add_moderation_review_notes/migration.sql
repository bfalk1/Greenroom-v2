-- Moderator's reason for the latest reject/removal, mirroring
-- creator_applications.review_note. Nullable: existing rows have no recorded
-- reason, and approval clears it so a published item never carries a stale one.
ALTER TABLE "samples" ADD COLUMN "review_note" TEXT;
ALTER TABLE "presets" ADD COLUMN "review_note" TEXT;

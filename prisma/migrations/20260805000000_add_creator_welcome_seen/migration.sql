-- Tracks whether a newly-approved creator has seen the congratulations modal.
-- Null on a CREATOR/ADMIN means the welcome is still pending.
ALTER TABLE "users" ADD COLUMN "creator_welcome_seen_at" TIMESTAMP(3);

-- Backfill everyone who is already a creator: they were approved before this
-- modal existed, so firing a "congratulations, you've been accepted" popup at
-- them now would be confusing. Only creators approved from here on get it.
UPDATE "users"
SET "creator_welcome_seen_at" = NOW()
WHERE "role" IN ('CREATOR', 'MODERATOR', 'ADMIN');

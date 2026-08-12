-- Who a broadcast was sent to, so the history list can say more than a raw
-- recipient count. Defaults to CREATORS: every broadcast that predates
-- targeting went to approved creators only.
ALTER TABLE "broadcasts" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'CREATORS';

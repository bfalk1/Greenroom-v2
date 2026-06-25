-- Switch creator payouts from a percentage model to flat cents-per-credit.
--
-- Existing rate values are PERCENTAGES (e.g. 70 = 70%). The new payout engine
-- reads these same columns as CENTS PER CREDIT, so leaving 70 in place would pay
-- 70¢/credit (~10x intended). Reset them: the platform default moves to the new
-- 7¢/credit, and per-creator overrides are cleared so creators fall back to the
-- platform default until an admin sets an explicit cents-per-credit override.

-- Platform default: change the column default and reset the existing row.
ALTER TABLE "platform_settings" ALTER COLUMN "creator_payout_rate" SET DEFAULT 7;
UPDATE "platform_settings" SET "creator_payout_rate" = 7;

-- Clear per-creator overrides (were percentages; would be misread as cents).
UPDATE "users" SET "custom_payout_rate" = NULL WHERE "custom_payout_rate" IS NOT NULL;

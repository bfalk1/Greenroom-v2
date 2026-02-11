-- AlterTable: Add creator-specific payout rate
ALTER TABLE "users" ADD COLUMN "payout_rate" INTEGER;

-- Comment: payout_rate is nullable. When null, fall back to platform_settings.creator_payout_rate
COMMENT ON COLUMN "users"."payout_rate" IS 'Creator-specific payout percentage (e.g., 70 = 70%). Null = use platform default.';

-- A flat, non-sales earnings grant to a creator (e.g. an on-time upload bonus or
-- a goodwill/correction adjustment). Summed into a creator's all-time earnings
-- alongside catalog sales and referral cash, so it flows through the normal
-- payout pipeline. See src/lib/payouts.ts (getCreatorAdjustmentCents).
CREATE TABLE "creator_earning_adjustments" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "amount_usd_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_earning_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_earning_adjustments_creator_id_idx" ON "creator_earning_adjustments"("creator_id");

ALTER TABLE "creator_earning_adjustments" ADD CONSTRAINT "creator_earning_adjustments_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

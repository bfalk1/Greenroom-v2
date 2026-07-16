-- Referral program: every user gets a personal referral code carried on their
-- signup link (/signup?ref=CODE). When a referred account is first created
-- (email verified), the new user is granted free credits; the referrer is
-- rewarded once per referred account — credits for USER referrers, payout cash
-- (integer cents, folded into the existing unpaid-balance payout math) for
-- CREATOR referrers.

-- New ledger type for referral credit grants (both sides of the reward).
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'REFERRAL';

-- Personal referral code, allocated lazily the first time the user opens the
-- referral panel. Nullable: most accounts never generate one.
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT;
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- One row per successful referral. The UNIQUE referred_user_id is the
-- exactly-once guard: both user-creation paths (/callback and /api/user/me)
-- can race to redeem for the same brand-new account, and only one insert wins.
-- Reward amounts are locked onto the row at redemption time so later rate or
-- policy changes never alter what was granted.
--
-- referred_user_id is nullable with ON DELETE SET NULL (not CASCADE): the row is
-- an earnings record whose referrer_cash_cents feeds the payout math, so it must
-- OUTLIVE the referred account. Deleting the referred user must not claw already-
-- earned cash back out of the referrer's future catalog sales. (Postgres treats
-- NULLs as distinct, so the unique index still guards live redemptions.)
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referred_user_id" UUID,
    "referred_credits" INTEGER NOT NULL DEFAULT 0,
    "referrer_credits" INTEGER NOT NULL DEFAULT 0,
    "referrer_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "referrer_reward_skipped_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referred_user_id_key" ON "referrals"("referred_user_id");
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at");

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey"
    FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey"
    FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Portion of a payout row's gross attributable to referral cash rewards,
-- locked in at payout creation so the invoice can itemize it without
-- re-deriving from mutable rates. 0 for all pre-existing rows.
ALTER TABLE "creator_payouts" ADD COLUMN "referral_bonus_cents" INTEGER NOT NULL DEFAULT 0;

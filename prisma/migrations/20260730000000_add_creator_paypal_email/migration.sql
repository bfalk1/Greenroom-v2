-- PayPal address a creator wants payouts sent to. Required before a payout can
-- be requested, queued by the monthly cron, or approved by an admin. Nullable
-- and additive: existing creators simply have no payout method on file yet.
ALTER TABLE "users" ADD COLUMN "paypal_email" TEXT;

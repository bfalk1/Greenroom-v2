-- Stripe Connect removed: payouts are now handled manually by admins.
-- Drop the Connect account pointer on users and the transfer id on payouts.
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_connect_id";
ALTER TABLE "creator_payouts" DROP COLUMN IF EXISTS "stripe_transfer_id";

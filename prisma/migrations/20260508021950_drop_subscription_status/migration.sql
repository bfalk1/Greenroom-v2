-- Drop subscriptions.status — users.subscription_status is now the single
-- source of truth (10 of 11 active users are beta users with no subscription
-- row at all, so the User column is the canonical paywall flag).
-- The SubscriptionStatus enum becomes unused after the column is gone.
ALTER TABLE "subscriptions" DROP COLUMN "status";
DROP TYPE "SubscriptionStatus";

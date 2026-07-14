-- Attribution marker for the funnel that produced a subscription
-- (e.g. 'vip-lifetime'). Nullable: existing rows stay unattributed.
ALTER TABLE "subscriptions" ADD COLUMN "acquisition_source" TEXT;

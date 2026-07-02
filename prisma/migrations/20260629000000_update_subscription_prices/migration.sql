-- Subscription list prices were lowered to match the published pricing tiers:
--   GA  $10.99 -> $9.99   (1099 -> 999 cents)
--   VIP $18.99 -> $17.99  (1899 -> 1799 cents)
--   AA  $34.99            (unchanged)
--
-- price_usd_cents is the figure used for admin revenue reporting and tier
-- ordering; the amount actually charged is the Stripe price, which must be
-- updated to match in the Stripe dashboard. Keyed by tier name so this is safe
-- to re-run.

UPDATE "subscription_tiers" SET "price_usd_cents" = 999  WHERE "name" = 'GA';
UPDATE "subscription_tiers" SET "price_usd_cents" = 1799 WHERE "name" = 'VIP';

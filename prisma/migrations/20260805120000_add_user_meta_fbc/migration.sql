-- Durable per-user Meta click id. Cookie-based fbc capture is jar-bound: an ad
-- click in an in-app browser followed by a purchase on desktop, or a checkout
-- after Safari ITP expires the JS-set _fbc, reaches checkout with no click id
-- (measured at ~86% of prod checkouts, 2026-07/08). /api/user/me banks the
-- freshest _fbc/gr_fbc against the account on every authenticated page load;
-- checkout reads it back when the live cookies carry none. Nullable and
-- additive: existing users simply have nothing banked yet.
ALTER TABLE "users" ADD COLUMN "meta_fbc" TEXT;
ALTER TABLE "users" ADD COLUMN "meta_fbc_updated_at" TIMESTAMP(3);

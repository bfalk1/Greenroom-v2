-- Durable per-user TikTok click id, the twin of meta_fbc (20260805120000).
-- TikTok ad traffic arrives in TikTok's in-app browser, and when the payment
-- redirect hands off to the system browser the _ttp/ttclid cookies do NOT
-- follow — so the conversion reaches activation with no click id at all and
-- can only be matched on email, never attributed to the ad click that paid
-- for it. /api/user/me banks the freshest gr_ttclid against the account on
-- every authenticated page load; the Events API reads it back at activation.
--
-- Stored as tt.1.<first-seen-ms>.<ttclid>: a raw ttclid carries no timestamp,
-- so without our own stamp a stale cookie in a second browser's jar would
-- clobber a newer banked click. Only the <ttclid> segment goes on the wire.
--
-- Nullable and additive: existing users simply have nothing banked yet.
ALTER TABLE "users" ADD COLUMN "tiktok_ttclid" TEXT;
ALTER TABLE "users" ADD COLUMN "tiktok_ttclid_updated_at" TIMESTAMP(3);

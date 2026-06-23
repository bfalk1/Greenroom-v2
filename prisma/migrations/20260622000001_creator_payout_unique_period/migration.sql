-- Prevent duplicate payouts for the same creator + period. Without this, two
-- payout runs (cron + admin, or a retry) could each pass the findFirst() check
-- and both issue a Stripe transfer. The unique index makes the second insert
-- fail (P2002) so only one payout row — and one transfer — can exist per period.
--
-- NOTE: if duplicate (creator_id, period_start, period_end) rows already exist
-- from before this fix, this index creation will fail. De-duplicate first, e.g.:
--   DELETE FROM creator_payouts a USING creator_payouts b
--   WHERE a.ctid < b.ctid AND a.creator_id = b.creator_id
--     AND a.period_start = b.period_start AND a.period_end = b.period_end
--     AND a.status <> 'PAID';
CREATE UNIQUE INDEX "creator_payouts_creator_id_period_start_period_end_key"
    ON "creator_payouts" ("creator_id", "period_start", "period_end");

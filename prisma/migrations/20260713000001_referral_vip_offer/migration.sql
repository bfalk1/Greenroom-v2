-- Creator referrals grant the referred user the VIP lifetime discount instead
-- of credits. The entitlement is a durable per-account unlock (set at
-- redemption), honored by the subscription checkout routes alongside the
-- gr_vip_offer cookie. Permanent (no expiry); the never-paid eligibility check
-- still prevents reuse once the account subscribes.
ALTER TABLE "users" ADD COLUMN "vip_offer_unlocked_at" TIMESTAMP(3);

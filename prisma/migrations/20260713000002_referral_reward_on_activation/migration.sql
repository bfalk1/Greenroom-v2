-- Referral rewards move from signup to VIP-subscription activation. At signup a
-- PENDING referral row is recorded (rewarded_at NULL, amounts 0); the reward is
-- granted only when the referred user activates a VIP subscription within the
-- reward window. referred_vip_offer snapshots the creator-referral decision
-- (the referred user's VIP unlock, granted at signup regardless).
ALTER TABLE "referrals" ADD COLUMN "referred_vip_offer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referrals" ADD COLUMN "rewarded_at" TIMESTAMP(3);

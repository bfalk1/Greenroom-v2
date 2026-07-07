-- Optional proof-of-payment for completed payouts. receipt_path points into
-- the private payout-receipts bucket; the creator downloads via a signed URL.
ALTER TABLE "creator_payouts" ADD COLUMN "receipt_path" TEXT;
ALTER TABLE "creator_payouts" ADD COLUMN "receipt_uploaded_at" TIMESTAMP(3);

-- Payout invoices + creator-covered processing fees.
--
-- Every payout now gets an invoice number at creation time, and a payment
-- processing fee (percent + fixed, platform-configurable) is deducted from the
-- creator's gross payout. amount_usd_cents stays GROSS — balance accounting is
-- unchanged; the net actually sent is amount_usd_cents - processing_fee_cents.

-- Fee configuration (basis points + fixed cents), defaults ≈ typical processor cost.
ALTER TABLE "platform_settings" ADD COLUMN "payout_fee_bps" INTEGER NOT NULL DEFAULT 290;
ALTER TABLE "platform_settings" ADD COLUMN "payout_fee_fixed_cents" INTEGER NOT NULL DEFAULT 30;

-- Fee + invoice number on each payout. Existing rows keep fee 0 (no fee was
-- charged historically).
ALTER TABLE "creator_payouts" ADD COLUMN "processing_fee_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "creator_payouts" ADD COLUMN "invoice_number" TEXT;

-- Race-safe source of invoice numbers for new payouts.
CREATE SEQUENCE IF NOT EXISTS "payout_invoice_seq" START 1;

-- Backfill invoice numbers for existing payouts, oldest first, so historical
-- rows are also referenceable by invoice.
WITH ordered AS (
  SELECT id, created_at,
         ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM "creator_payouts"
)
UPDATE "creator_payouts" cp
SET "invoice_number" =
      'GR-' || EXTRACT(YEAR FROM o.created_at)::text || '-' || LPAD(o.rn::text, 6, '0')
FROM ordered o
WHERE cp.id = o.id;

-- Continue the sequence after the backfilled numbers.
SELECT setval('payout_invoice_seq',
              (SELECT COUNT(*) FROM "creator_payouts") + 1,
              false);

CREATE UNIQUE INDEX "creator_payouts_invoice_number_key" ON "creator_payouts"("invoice_number");

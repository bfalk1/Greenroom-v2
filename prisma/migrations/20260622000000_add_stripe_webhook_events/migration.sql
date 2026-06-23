-- Stripe webhook idempotency: one row per processed event id. The credit-
-- granting webhook handlers insert the event id inside the same transaction
-- that mutates the balance, so a redelivered event conflicts on the primary
-- key and the whole transaction rolls back — each event applies exactly once.
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- PayPal subscriptions alongside Stripe. provider discriminates which billing
-- engine owns the subscription; paypal_subscription_id is the webhook lookup
-- key (unique — one Greenroom subscription per PayPal subscription).
ALTER TABLE "subscriptions" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE "subscriptions" ADD COLUMN "paypal_subscription_id" TEXT;

CREATE UNIQUE INDEX "subscriptions_paypal_subscription_id_key" ON "subscriptions"("paypal_subscription_id");

-- PayPal analog of stripe_webhook_events for subscription credit grants:
-- marker rows ("sale:<txnId>", "event:<eventId>") inserted in the same
-- transaction as the grant, so redelivered events conflict and roll back.
CREATE TABLE "paypal_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paypal_webhook_events_pkey" PRIMARY KEY ("id")
);

-- PayPal credit-pack checkout: one row per PayPal order, created before the
-- user is redirected to PayPal. Credits are granted in the same transaction
-- that flips status CREATED -> COMPLETED, so the grant applies exactly once
-- even when the return redirect and the webhook both try to settle the order.
CREATE TABLE "paypal_orders" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount_usd_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "capture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypal_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paypal_orders_user_id_idx" ON "paypal_orders"("user_id");

-- Refund/denial webhooks arrive keyed by capture id, not order id.
CREATE INDEX "paypal_orders_capture_id_idx" ON "paypal_orders"("capture_id");

ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

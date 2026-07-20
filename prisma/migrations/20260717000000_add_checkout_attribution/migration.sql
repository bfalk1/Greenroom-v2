-- Browser signals captured at PayPal subscription-checkout time, read back by
-- the server-side Meta CAPI Purchase at activation. Additive only.
CREATE TABLE "checkout_attributions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "fbp" TEXT,
    "fbc" TEXT,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "event_source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_attributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkout_attributions_user_id_idx" ON "checkout_attributions"("user_id");

ALTER TABLE "checkout_attributions" ADD CONSTRAINT "checkout_attributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

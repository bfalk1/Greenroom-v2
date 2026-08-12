/**
 * Create the "$5.99 first month" VIP intro Billing Plan in PayPal and print
 * the PAYPAL_VIP_FIRST_MONTH_PLAN_ID env line to copy wherever it's needed
 * (.env.local for sandbox, Vercel for live).
 *
 * PayPal can't apply a one-time coupon to a subscription, so the intro price
 * is a plan shape: a PAID TRIAL cycle (1 month at the intro price) followed by
 * the REGULAR cycle at the full VIP price, forever. The trial charge still
 * fires PAYMENT.SALE.COMPLETED, so the normal per-sale credit grant covers
 * month one.
 *
 * Run with the target environment's credentials in the shell env:
 *   set -a; source .env.local; set +a; npx tsx scripts/create-paypal-first-month-plan.ts
 *
 * Reuses an existing catalog product when PAYPAL_PRODUCT_ID is set; otherwise
 * creates one. Safe to re-run: creates a NEW plan each time (PayPal plans are
 * immutable-ish); old plans can be deactivated in the PayPal dashboard.
 */
import { VIP_FIRST_MONTH_OFFER } from "../src/lib/stripe/publicPriceConfig";
import { prisma } from "../src/lib/prisma";

const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function main() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET must be set");
  }

  const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error(`Token request failed (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const api = async (path: string, body: unknown) => {
    const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`${path} failed (${res.status}): ${JSON.stringify(json)}`);
    }
    return json as { id: string };
  };

  // The regular cycle must bill what the DB tier (and Stripe) bill — a drifted
  // config would silently charge intro buyers a stale renewal price forever.
  const tier = await prisma.subscriptionTier.findFirst({
    where: { name: VIP_FIRST_MONTH_OFFER.tierName, isActive: true },
  });
  if (!tier) {
    throw new Error(
      `No active tier named ${VIP_FIRST_MONTH_OFFER.tierName} in the database`
    );
  }
  if (tier.priceUsdCents !== Math.round(VIP_FIRST_MONTH_OFFER.regularPrice * 100)) {
    throw new Error(
      `Price mismatch for ${VIP_FIRST_MONTH_OFFER.tierName}: config says $${VIP_FIRST_MONTH_OFFER.regularPrice}, DB tier says ${tier.priceUsdCents}¢ — reconcile before creating the plan`
    );
  }
  await prisma.$disconnect();

  console.log(`Creating first-month plan on ${PAYPAL_API_BASE} ...`);

  let productId = process.env.PAYPAL_PRODUCT_ID?.trim();
  if (!productId) {
    const product = await api("/v1/catalogs/products", {
      name: "Greenroom Subscription",
      description: "Monthly Greenroom credits for royalty-free samples",
      type: "SERVICE",
      category: "SOFTWARE",
    });
    productId = product.id;
    console.log(`Product: ${productId}`);
  } else {
    console.log(`Reusing product: ${productId}`);
  }

  const plan = await api("/v1/billing/plans", {
    product_id: productId,
    name: `Greenroom ${VIP_FIRST_MONTH_OFFER.tierName} — first month $${VIP_FIRST_MONTH_OFFER.firstMonthPrice}`,
    description: `${VIP_FIRST_MONTH_OFFER.credits} credits per month; first month $${VIP_FIRST_MONTH_OFFER.firstMonthPrice}, then $${VIP_FIRST_MONTH_OFFER.regularPrice}`,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "TRIAL",
        sequence: 1,
        total_cycles: 1,
        pricing_scheme: {
          fixed_price: {
            value: VIP_FIRST_MONTH_OFFER.firstMonthPrice.toFixed(2),
            currency_code: "USD",
          },
        },
      },
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 2,
        total_cycles: 0, // infinite — runs until canceled
        pricing_scheme: {
          fixed_price: {
            value: VIP_FIRST_MONTH_OFFER.regularPrice.toFixed(2),
            currency_code: "USD",
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      // After this many consecutive failed cycles PayPal suspends the
      // subscription (-> our past_due), rather than silently retrying forever.
      payment_failure_threshold: 2,
    },
  });

  console.log(
    `Plan (first month $${VIP_FIRST_MONTH_OFFER.firstMonthPrice}, then $${VIP_FIRST_MONTH_OFFER.regularPrice}/mo): ${plan.id}`
  );
  console.log("\nAdd this to the environment:\n");
  console.log(`PAYPAL_VIP_FIRST_MONTH_PLAN_ID=${plan.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

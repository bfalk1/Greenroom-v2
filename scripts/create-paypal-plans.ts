/**
 * Create the Greenroom subscription Product + one Billing Plan per tier in
 * PayPal, and print the PAYPAL_*_PLAN_ID env lines to copy wherever they're
 * needed (.env.local for sandbox, Vercel for live).
 *
 * Run with the target environment's credentials in the shell env:
 *   set -a; source .env.local; set +a; npx tsx scripts/create-paypal-plans.ts
 *
 * Safe to re-run: creates a NEW product + plans each time (PayPal plans are
 * immutable-ish); old plans can be deactivated in the PayPal dashboard.
 */
import { PUBLIC_SUBSCRIPTION_PACKAGES } from "../src/lib/stripe/publicPriceConfig";
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

  // Prices come from the display config; the DB tiers (what Stripe bills and
  // admins edit) must agree, or PayPal would silently charge a stale price.
  for (const pkg of PUBLIC_SUBSCRIPTION_PACKAGES) {
    const tier = await prisma.subscriptionTier.findFirst({
      where: { name: pkg.tierName, isActive: true },
    });
    if (!tier) {
      throw new Error(`No active tier named ${pkg.tierName} in the database`);
    }
    if (tier.priceUsdCents !== Math.round(pkg.price * 100)) {
      throw new Error(
        `Price mismatch for ${pkg.tierName}: config says $${pkg.price}, DB tier says ${tier.priceUsdCents}¢ — reconcile before creating PayPal plans`
      );
    }
  }
  await prisma.$disconnect();

  console.log(`Creating product + plans on ${PAYPAL_API_BASE} ...`);

  const product = await api("/v1/catalogs/products", {
    name: "Greenroom Subscription",
    description: "Monthly Greenroom credits for royalty-free samples",
    type: "SERVICE",
    category: "SOFTWARE",
  });
  console.log(`Product: ${product.id}`);

  const envLines: string[] = [];

  for (const pkg of PUBLIC_SUBSCRIPTION_PACKAGES) {
    const plan = await api("/v1/billing/plans", {
      product_id: product.id,
      name: `Greenroom ${pkg.name}`,
      description: `${pkg.credits} credits per month`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // infinite — runs until canceled
          pricing_scheme: {
            fixed_price: { value: pkg.price.toFixed(2), currency_code: "USD" },
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
    envLines.push(`PAYPAL_${pkg.tierName}_PLAN_ID=${plan.id}`);
    console.log(`Plan ${pkg.tierName} ($${pkg.price}/mo, ${pkg.credits} credits): ${plan.id}`);
  }

  console.log("\nAdd these to the environment:\n");
  console.log(envLines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

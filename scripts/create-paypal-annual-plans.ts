/**
 * Create the annual (YEAR-interval) PayPal Billing Plans for every tier and
 * print the PAYPAL_*_ANNUAL_PLAN_ID env lines to copy wherever they're needed
 * (.env.local for sandbox, Vercel for live).
 *
 * One yearly charge at the display config's annualPrice; the per-sale credit
 * grant multiplies by 12 for these plans (paypalPlanBillingInterval), so a
 * yearly sale delivers all 12 months of credits upfront.
 *
 * Run with the target environment's credentials in the shell env:
 *   set -a; source .env.local; set +a; npx tsx scripts/create-paypal-annual-plans.ts
 *
 * Reuses an existing catalog product when PAYPAL_PRODUCT_ID is set; otherwise
 * creates one. Safe to re-run: creates NEW plans each time (PayPal plans are
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

  // The tier's DB monthly price is the anchor the annual discount is computed
  // against — a drifted config would advertise a bogus saving.
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

  console.log(`Creating annual plans on ${PAYPAL_API_BASE} ...`);

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

  const envLines: string[] = [];

  for (const pkg of PUBLIC_SUBSCRIPTION_PACKAGES) {
    const plan = await api("/v1/billing/plans", {
      product_id: productId,
      name: `Greenroom ${pkg.name} Annual`,
      description: `${pkg.credits * 12} credits per year (12 months upfront)`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "YEAR", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // infinite — runs until canceled
          pricing_scheme: {
            fixed_price: {
              value: pkg.annualPrice.toFixed(2),
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
    envLines.push(`PAYPAL_${pkg.tierName}_ANNUAL_PLAN_ID=${plan.id}`);
    console.log(
      `Plan ${pkg.tierName} annual ($${pkg.annualPrice}/yr, ${pkg.credits * 12} credits/yr): ${plan.id}`
    );
  }

  console.log("\nAdd these to the environment:\n");
  console.log(envLines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

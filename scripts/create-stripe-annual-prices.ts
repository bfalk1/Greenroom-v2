/**
 * Create the annual (yearly-interval) Stripe Prices for every tier and print
 * the NEXT_PUBLIC_STRIPE_*_ANNUAL_PRICE_ID env lines to copy wherever they're
 * needed (.env.local for test mode, Vercel for live).
 *
 * Each annual price is created on the SAME Stripe Product as the tier's
 * existing monthly price (resolved from the monthly env id), at the
 * annualPrice from the display config — so /pricing, the charge, and the Meta
 * value reporting all agree. /api/health/payments verifies the live prices
 * after deploy.
 *
 * Run with the target environment's key + monthly price ids in the shell env:
 *   set -a; source .env.local; set +a; npx tsx scripts/create-stripe-annual-prices.ts
 *
 * Safe to re-run: creates NEW prices each time; archive old ones in the
 * dashboard (archiving never affects existing subscriptions).
 */
import Stripe from "stripe";
import { PUBLIC_SUBSCRIPTION_PACKAGES } from "../src/lib/stripe/publicPriceConfig";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY must be set");
  const stripe = new Stripe(key);

  const envLines: string[] = [];

  for (const pkg of PUBLIC_SUBSCRIPTION_PACKAGES) {
    const monthlyId =
      process.env[`STRIPE_${pkg.tierName}_PRICE_ID`]?.trim() ||
      process.env[`NEXT_PUBLIC_STRIPE_${pkg.tierName}_PRICE_ID`]?.trim();
    if (!monthlyId) {
      throw new Error(
        `No monthly price id for ${pkg.tierName} in the env — the annual price must share its product`
      );
    }

    const monthly = await stripe.prices.retrieve(monthlyId);
    const productId =
      typeof monthly.product === "string" ? monthly.product : monthly.product.id;

    const annual = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: Math.round(pkg.annualPrice * 100),
      recurring: { interval: "year" },
      nickname: `${pkg.name} annual ($${pkg.annualPrice}/yr)`,
    });

    envLines.push(
      `NEXT_PUBLIC_STRIPE_${pkg.tierName}_ANNUAL_PRICE_ID=${annual.id}`
    );
    console.log(
      `Price ${pkg.tierName} annual ($${pkg.annualPrice}/yr on product ${productId}): ${annual.id}`
    );
  }

  console.log("\nAdd these to the environment:\n");
  console.log(envLines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

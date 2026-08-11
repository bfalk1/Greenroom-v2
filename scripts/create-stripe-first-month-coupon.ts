/**
 * Create the "$5.99 first month" VIP intro coupon in Stripe and print the
 * STRIPE_VIP_FIRST_MONTH_COUPON_ID env line to copy wherever it's needed
 * (.env.local for test mode, Vercel for live).
 *
 * The amount is derived from the display config (regular − first-month price)
 * and duration is "once" — the property that returns renewals to full price.
 * /api/health/payments verifies both on the live coupon after deploy.
 *
 * Run with the target environment's key in the shell env:
 *   set -a; source .env.local; set +a; npx tsx scripts/create-stripe-first-month-coupon.ts
 *
 * Safe to re-run: creates a NEW coupon each time; old ones can be deleted in
 * the Stripe dashboard (deleting a coupon never affects past redemptions).
 */
import Stripe from "stripe";
import { VIP_FIRST_MONTH_OFFER } from "../src/lib/stripe/publicPriceConfig";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY must be set");
  const stripe = new Stripe(key);

  const amountOff = Math.round(
    (VIP_FIRST_MONTH_OFFER.regularPrice - VIP_FIRST_MONTH_OFFER.firstMonthPrice) *
      100
  );

  const coupon = await stripe.coupons.create({
    name: `VIP first month $${VIP_FIRST_MONTH_OFFER.firstMonthPrice}`,
    amount_off: amountOff,
    currency: "usd",
    duration: "once",
  });

  console.log(
    `Coupon ($${(amountOff / 100).toFixed(2)} off the first invoice): ${coupon.id}`
  );
  console.log("\nAdd this to the environment:\n");
  console.log(`STRIPE_VIP_FIRST_MONTH_COUPON_ID=${coupon.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export const SUBSCRIPTION_TIERS = {
  GA: {
    name: "GA",
    displayName: "General Admission",
    creditsPerMonth: 100,
    priceUsdCents: 1099,
    stripePriceId:
      process.env.STRIPE_GA_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_GA_PRICE_ID ?? "",
  },
  VIP: {
    name: "VIP",
    displayName: "VIP",
    creditsPerMonth: 200,
    priceUsdCents: 1899,
    stripePriceId:
      process.env.STRIPE_VIP_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID ?? "",
  },
  AA: {
    name: "AA",
    displayName: "All Access",
    creditsPerMonth: 500,
    priceUsdCents: 3499,
    stripePriceId:
      process.env.STRIPE_AA_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_AA_PRICE_ID ?? "",
  },
} as const;

export type TierName = keyof typeof SUBSCRIPTION_TIERS;

// Reverse-map a Stripe price ID to its tier name using the env-driven config
// above — the price↔tier mapping lives ONLY in env (this mirrors PayPal's
// tierNameForPaypalPlan). Callers resolve the DB SubscriptionTier row by this
// stable `name`, so rotating a Stripe price ID is an env-only change: it can't
// drift from the subscription_tiers.stripe_price_id column and strand a
// checkout ("Invalid subscription plan") or a webhook credit grant.
export function tierNameForStripePrice(priceId: string): TierName | null {
  if (!priceId) return null;
  for (const name of Object.keys(SUBSCRIPTION_TIERS) as TierName[]) {
    const configured = SUBSCRIPTION_TIERS[name].stripePriceId;
    // An unset env var collapses stripePriceId to "" — never match on empty, or
    // a missing price ID would resolve to whichever tier is also unconfigured.
    if (configured && configured === priceId) return name;
  }
  return null;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Tax collection is opt-in via NEXT_PUBLIC_TAX_ENABLED (the single master flag
// both providers read) so this ships INERT: enabling automatic_tax before
// Stripe Tax + a tax_behavior/tax_code are configured on each Price would 400
// every checkout. Flip the flag only once the dashboard is set up (see
// docs/tax-runbook.md). Model = TAX-EXCLUSIVE (tax_behavior set per-Price in
// the dashboard): the buyer pays the advertised price PLUS the provincial rate
// on top, so the tax comes out of the customer, not our margin — chosen because
// a large Canadian base makes absorbing it too costly. automatic_tax derives
// the rate from the customer's location, so we collect + persist the billing
// address. This helper is behavior-agnostic — it just enables tax;
// inclusive/exclusive lives on the Price. (PayPal can't do this natively — its
// equivalent is the province rate table in src/lib/tax/canadaRates.ts.)
export function stripeTaxCheckoutParams(): {
  automatic_tax?: { enabled: true };
  customer_update?: { address: "auto" };
  billing_address_collection?: "required";
} {
  if (process.env.NEXT_PUBLIC_TAX_ENABLED !== "true") return {};
  return {
    automatic_tax: { enabled: true },
    // Required when a pre-existing `customer` is passed: persist the address
    // collected at checkout back onto the customer, or automatic_tax errors
    // ("customer has no address") and renewals have no location to tax against.
    customer_update: { address: "auto" },
    billing_address_collection: "required",
  };
}

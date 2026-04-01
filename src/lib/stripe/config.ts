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

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// annualPrice: yearly billing at a "Save 15%" discount — each value is 12× the
// monthly price rounded DOWN to the nearest .99 below exactly-15%-off, so every
// tier's real saving is ≥ 15% (15.8% / 15.2% / 15.2%) and the marketing claim
// is never an overstatement. config.test.ts asserts both the cents mirror in
// stripe/config.ts and the ≥15% floor. Annual subscribers get all 12 months of
// credits upfront at purchase and again at each yearly renewal.
export const PUBLIC_SUBSCRIPTION_PACKAGES = [
  {
    name: "General Admission",
    tierName: "GA",
    credits: 100,
    price: 9.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GA_PRICE_ID ?? "",
    annualPrice: 100.99,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_GA_ANNUAL_PRICE_ID ?? "",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: false,
  },
  {
    name: "VIP",
    tierName: "VIP",
    credits: 200,
    price: 17.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID ?? "",
    annualPrice: 182.99,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_VIP_ANNUAL_PRICE_ID ?? "",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: true,
  },
  {
    name: "All Access",
    tierName: "AA",
    credits: 500,
    price: 34.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_AA_PRICE_ID ?? "",
    annualPrice: 355.99,
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_AA_ANNUAL_PRICE_ID ?? "",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: false,
  },
] as const;

// Returning-subscriber "lifetime VIP" offer, surfaced only on the password-gated
// /vip page. The subscription rides the normal VIP price/plan — the $6/mo
// discount is applied server-side (Stripe: a coupon; PayPal: a dedicated
// discounted billing plan). These values are display-only and must mirror the
// VIP package price above + the coupon/plan amount in Stripe/PayPal.
export const VIP_LIFETIME_OFFER = {
  tierName: "VIP",
  credits: 200,
  regularPrice: 17.99,
  lifetimePrice: 11.99,
  priceId: process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID ?? "",
} as const;

// Public "$5.99 first month" VIP intro offer, surfaced on /promo and the
// /pricing VIP card. The subscription rides the normal VIP price/plan — the
// discount covers ONLY the first billing cycle (Stripe: a duration-"once"
// coupon; PayPal: a dedicated plan with a discounted first cycle), then renews
// at the full VIP price. New-member offer: same never-PAID eligibility rule as
// the lifetime offer (src/lib/lifetimeEligibility.ts), enforced server-side.
// These values are display-only and must mirror the VIP package price above +
// the coupon/plan amounts in Stripe/PayPal.
export const VIP_FIRST_MONTH_OFFER = {
  tierName: "VIP",
  credits: 200,
  regularPrice: 17.99,
  firstMonthPrice: 5.99,
  priceId: process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID ?? "",
} as const;

export const PUBLIC_CREDIT_PACKAGES = [
  {
    credits: 50,
    price: 5.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_CREDITS_50_PRICE_ID ?? "",
    perCredit: "0.12",
    popular: false,
    bestValue: false,
  },
  {
    credits: 150,
    price: 14.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_CREDITS_150_PRICE_ID ?? "",
    perCredit: "0.10",
    popular: true,
    bestValue: false,
  },
  {
    credits: 400,
    price: 34.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_CREDITS_400_PRICE_ID ?? "",
    perCredit: "0.09",
    popular: false,
    bestValue: true,
  },
] as const;

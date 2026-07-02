export const PUBLIC_SUBSCRIPTION_PACKAGES = [
  {
    name: "General Admission",
    tierName: "GA",
    credits: 100,
    price: 9.99,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GA_PRICE_ID ?? "",
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
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: false,
  },
] as const;

// Returning-subscriber "lifetime VIP" offer, surfaced only on the password-gated
// /vip page. The subscription itself still rides the normal VIP price ID — the
// $6/mo discount is applied server-side as a Stripe coupon at checkout (see
// src/app/api/subscription/checkout/route.ts). These values are display-only and
// must mirror the VIP package price above + the coupon amount in Stripe.
export const VIP_LIFETIME_OFFER = {
  tierName: "VIP",
  credits: 200,
  regularPrice: 17.99,
  lifetimePrice: 11.99,
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

import {
  VIP_LIFETIME_OFFER,
  VIP_FIRST_MONTH_OFFER,
  PUBLIC_SUBSCRIPTION_PACKAGES,
} from "./stripe/publicPriceConfig";

/**
 * How a subscription is actually billed, derived from the columns we store.
 *
 * A subscriptions row records neither the billing interval nor the coupon — the
 * provider owns both — so every surface that reports revenue or offer
 * performance has to re-derive them. Doing that inline is how two "official"
 * numbers start circulating, so the rules live here once and @/lib/mrr, the
 * admin Subscribers dashboard, and anything else that follows all call in.
 *
 * Pure functions only, no Prisma import, so this stays unit-testable.
 */

/** VIP subs acquired through the /vip lifetime offer bill at a permanent discount. */
export const VIP_LIFETIME_CENTS = Math.round(
  VIP_LIFETIME_OFFER.lifetimePrice * 100
);

/** acquisitionSource value written at activation by the lifetime-offer funnel. */
export const VIP_LIFETIME_SOURCE = "vip-lifetime";

/** acquisitionSource written by the public "$5.99 first month" /promo funnel. */
export const VIP_FIRST_MONTH_SOURCE = "vip-first-month";

/** What the promo cohort pays for its ONE discounted cycle (display only). */
export const VIP_FIRST_MONTH_CENTS = Math.round(
  VIP_FIRST_MONTH_OFFER.firstMonthPrice * 100
);

/** Annual list price per tier name (GA/VIP/AA), in cents. */
const ANNUAL_CENTS_BY_TIER = new Map(
  PUBLIC_SUBSCRIPTION_PACKAGES.map((p) => [
    p.tierName as string,
    Math.round(p.annualPrice * 100),
  ])
);

/**
 * Billing periods are ~1 month or ~1 year, nothing in between, so the period
 * span is what identifies an annual sub — the interval isn't persisted on the
 * subscriptions row (only the provider knows it) and back-filling it would mean
 * a round trip per sub to Stripe/PayPal. 300 days sits far outside both a long
 * month and a short year, so no real period lands near the boundary.
 */
const ANNUAL_SPAN_MS = 1000 * 60 * 60 * 24 * 300;

export function isAnnualPeriod(start: Date, end: Date): boolean {
  return end.getTime() - start.getTime() > ANNUAL_SPAN_MS;
}

/**
 * The cohort a sub belongs to, which is what decides its monthly-equivalent
 * price. Mutually exclusive by construction: the discounted offers are
 * monthly-only (checkout rejects annual + lifetime/firstMonth together), so a
 * sub is at most one of these.
 */
export type SubCohort = "list" | "lifetime" | "promo" | "annual";

export function cohortOf(sub: {
  acquisitionSource: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): SubCohort {
  if (sub.acquisitionSource === VIP_LIFETIME_SOURCE) return "lifetime";
  if (isAnnualPeriod(sub.currentPeriodStart, sub.currentPeriodEnd))
    return "annual";
  if (sub.acquisitionSource === VIP_FIRST_MONTH_SOURCE) return "promo";
  return "list";
}

/** Human labels for the cohorts, shared by every surface that reports them. */
export const COHORT_LABEL: Record<SubCohort, string> = {
  list: "Monthly (list price)",
  lifetime: "VIP lifetime offer",
  promo: `VIP $${VIP_FIRST_MONTH_OFFER.firstMonthPrice} first month`,
  annual: "Annual",
};

/** Suffix appended to a tier name when breaking MRR out by cohort. */
export const COHORT_TIER_SUFFIX: Record<SubCohort, string> = {
  list: "",
  lifetime: "(lifetime offer)",
  promo: "(first-month promo)",
  annual: "(annual)",
};

/**
 * Monthly-equivalent billing for one sub, in cents.
 *
 * - lifetime: the locked discount, applied at the processor (Stripe coupon /
 *   PayPal plan), so the tier's list price would overstate these by $6/mo.
 * - annual: the yearly charge ÷ 12 — list price would overstate them by the
 *   annual discount.
 * - promo: LIST price. The $5.99 is a duration-"once" coupon, so it moves the
 *   first invoice only; treating it as recurring would understate the book from
 *   month two on, for a cohort that is mostly already past month one.
 */
export function monthlyUnitCents(
  cohort: SubCohort,
  tier: { name: string; priceUsdCents: number } | null | undefined
): number {
  if (cohort === "lifetime") return VIP_LIFETIME_CENTS;
  if (cohort === "annual") {
    return Math.round(
      (ANNUAL_CENTS_BY_TIER.get(tier?.name ?? "") ??
        (tier?.priceUsdCents ?? 0) * 12) / 12
    );
  }
  return tier?.priceUsdCents ?? 0;
}

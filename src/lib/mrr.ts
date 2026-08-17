import { prisma } from "@/lib/prisma";
import {
  COHORT_TIER_SUFFIX,
  cohortOf,
  monthlyUnitCents,
} from "@/lib/subscriptionCohorts";

// The cohort rules (which sub is annual / promo / lifetime, and what each one
// bills per month) live in @/lib/subscriptionCohorts so the admin dashboard
// classifies subs exactly the way this snapshot prices them. Re-exported here
// because callers already import these names from @/lib/mrr.
export {
  COHORT_LABEL,
  COHORT_TIER_SUFFIX,
  VIP_FIRST_MONTH_CENTS,
  VIP_FIRST_MONTH_SOURCE,
  VIP_LIFETIME_CENTS,
  VIP_LIFETIME_SOURCE,
  cohortOf,
  isAnnualPeriod,
  monthlyUnitCents,
  type SubCohort,
} from "@/lib/subscriptionCohorts";

/**
 * Recurring revenue currently on the books, computed from the subscription
 * table rather than from provider dashboards — Stripe and PayPal each only know
 * about their own half, and neither knows that a VIP on the lifetime offer bills
 * less than list price.
 *
 * Single source of truth: the PostHog snapshot cron and anything else reporting
 * MRR must call this, or two "official" numbers start circulating.
 *
 * Gross billing only. It does NOT net out processor fees, creator payouts, or
 * refunds, and it excludes one-off credit-pack purchases (not recurring).
 */

export type MrrTierBreakdown = {
  /** Tier name (GA/VIP/AA), suffixed for the lifetime/annual cohorts. */
  tier: string;
  /** True for the discounted VIP lifetime-offer cohort. */
  lifetime: boolean;
  subs: number;
  mrrCents: number;
  /** Per-sub MONTHLY-equivalent billing amount for this bucket, in cents. */
  unitCents: number;
};

export type MrrSnapshot = {
  /** Active = current period hasn't ended yet. */
  activeSubs: number;
  mrrCents: number;
  arrCents: number;
  byTier: MrrTierBreakdown[];
  byProvider: { provider: string; subs: number; mrrCents: number }[];
  /** Active now but flagged to cancel — revenue with a known end date. */
  cancelingSubs: number;
  cancelingMrrCents: number;
  /** Rows whose period already ended (excluded from every figure above). */
  lapsedSubs: number;
  /** Tiers referenced by a subscription but missing a price (counted as $0). */
  unpricedSubs: number;
  computedAt: Date;
};

export async function computeMrrSnapshot(now: Date = new Date()): Promise<MrrSnapshot> {
  const [tiers, subs] = await Promise.all([
    prisma.subscriptionTier.findMany({
      select: { id: true, name: true, priceUsdCents: true },
    }),
    prisma.subscription.findMany({
      select: {
        tierId: true,
        provider: true,
        acquisitionSource: true,
        cancelAtPeriodEnd: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  const tierById = new Map(tiers.map((t) => [t.id, t]));
  const active = subs.filter((s) => s.currentPeriodEnd > now);

  const tierBuckets = new Map<string, MrrTierBreakdown>();
  const providerBuckets = new Map<string, { provider: string; subs: number; mrrCents: number }>();

  let mrrCents = 0;
  let cancelingSubs = 0;
  let cancelingMrrCents = 0;
  let unpricedSubs = 0;

  for (const sub of active) {
    const tier = tierById.get(sub.tierId);
    const cohort = cohortOf(sub);
    const lifetime = cohort === "lifetime";
    const unitCents = monthlyUnitCents(cohort, tier);
    if (!tier) unpricedSubs++;

    const tierName = tier?.name ?? "UNKNOWN";
    const key = `${tierName}:${cohort}`;
    const bucket = tierBuckets.get(key) ?? {
      tier: COHORT_TIER_SUFFIX[cohort]
        ? `${tierName} ${COHORT_TIER_SUFFIX[cohort]}`
        : tierName,
      lifetime,
      subs: 0,
      mrrCents: 0,
      unitCents,
    };
    bucket.subs++;
    bucket.mrrCents += unitCents;
    tierBuckets.set(key, bucket);

    const pBucket = providerBuckets.get(sub.provider) ?? {
      provider: sub.provider,
      subs: 0,
      mrrCents: 0,
    };
    pBucket.subs++;
    pBucket.mrrCents += unitCents;
    providerBuckets.set(sub.provider, pBucket);

    mrrCents += unitCents;

    if (sub.cancelAtPeriodEnd) {
      cancelingSubs++;
      cancelingMrrCents += unitCents;
    }
  }

  return {
    activeSubs: active.length,
    mrrCents,
    arrCents: mrrCents * 12,
    byTier: [...tierBuckets.values()].sort((a, b) => b.mrrCents - a.mrrCents),
    byProvider: [...providerBuckets.values()].sort((a, b) => b.mrrCents - a.mrrCents),
    cancelingSubs,
    cancelingMrrCents,
    lapsedSubs: subs.length - active.length,
    unpricedSubs,
    computedAt: now,
  };
}

import { prisma } from "@/lib/prisma";
import {
  VIP_LIFETIME_OFFER,
  PUBLIC_SUBSCRIPTION_PACKAGES,
} from "@/lib/stripe/publicPriceConfig";

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

/** VIP subs acquired through the /vip lifetime offer bill at a permanent discount. */
export const VIP_LIFETIME_CENTS = Math.round(
  VIP_LIFETIME_OFFER.lifetimePrice * 100
);

/** acquisitionSource value written at activation by the lifetime-offer funnel. */
export const VIP_LIFETIME_SOURCE = "vip-lifetime";

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

  // Annual subs (recognized by period span — billing periods are ~1 month or
  // ~1 year, nothing in between) bill their yearly price once; their
  // monthly-equivalent contribution is that charge ÷ 12, NOT the tier's
  // monthly list price (which would overstate them by the annual discount).
  const annualCentsByTier = new Map(
    PUBLIC_SUBSCRIPTION_PACKAGES.map((p) => [
      p.tierName as string,
      Math.round(p.annualPrice * 100),
    ])
  );
  const ANNUAL_SPAN_MS = 1000 * 60 * 60 * 24 * 300;

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
    const lifetime = sub.acquisitionSource === VIP_LIFETIME_SOURCE;
    const annual =
      sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime() >
      ANNUAL_SPAN_MS;
    // The lifetime discount is applied at the processor (Stripe coupon / PayPal
    // plan), so the tier's list price would overstate these by $6/mo each.
    // (The offers are monthly-only, so lifetime and annual never coincide.)
    const unitCents = lifetime
      ? VIP_LIFETIME_CENTS
      : annual
        ? Math.round(
            (annualCentsByTier.get(tier?.name ?? "") ??
              (tier?.priceUsdCents ?? 0) * 12) / 12
          )
        : (tier?.priceUsdCents ?? 0);
    if (!tier) unpricedSubs++;

    const tierName = tier?.name ?? "UNKNOWN";
    const key = `${tierName}:${lifetime}:${annual}`;
    const bucket = tierBuckets.get(key) ?? {
      tier: lifetime
        ? `${tierName} (lifetime offer)`
        : annual
          ? `${tierName} (annual)`
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

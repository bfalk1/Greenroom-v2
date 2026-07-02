/**
 * Canonical creator-payout math — the SINGLE source of truth for how credits
 * convert to money. Pure (no DB / no imports) so it can be unit-tested directly.
 *
 * Model (flat cents-per-credit):
 *   a creator earns a fixed number of cents for every credit spent on their work.
 *
 *   payoutCents = floor(credits × centsPerCredit)
 *
 * IMPORTANT: `centsPerCredit` is CENTS PER CREDIT (7 = $0.07/credit), NOT a
 * percentage. The per-creator override (`User.customPayoutRate`) and the platform
 * default (`PlatformSetting.creatorPayoutRate`) are both stored in these units —
 * keep ALL rate handling in cents-per-credit so the displayed estimate and the
 * real Stripe transfer can never diverge.
 */

/** Default creator earnings per credit, in cents. */
export const DEFAULT_PAYOUT_CENTS_PER_CREDIT = 7;

/** Minimum balance (in cents) before a payout can be created/requested. */
export const MIN_PAYOUT_CENTS = 5000; // $50.00

/** Resolve the effective per-creator rate (cents/credit), falling back to the platform default. */
export function resolveCentsPerCredit(
  creatorOverrideCents: number | null | undefined,
  platformDefaultCents: number | null | undefined
): number {
  if (creatorOverrideCents != null && Number.isFinite(creatorOverrideCents)) {
    return creatorOverrideCents;
  }
  if (platformDefaultCents != null && Number.isFinite(platformDefaultCents)) {
    return platformDefaultCents;
  }
  return DEFAULT_PAYOUT_CENTS_PER_CREDIT;
}

/**
 * Compute creator earnings in whole cents for a number of credits spent.
 * Returns 0 for non-positive / non-finite inputs. Floors to whole cents.
 */
export function computePayoutCents(
  credits: number,
  centsPerCredit: number
): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  if (!Number.isFinite(centsPerCredit) || centsPerCredit <= 0) return 0;
  return Math.floor(credits * centsPerCredit);
}

/**
 * The still-owed portion of a creator's all-time earnings: total earned minus
 * what's already been accounted for (PAID + in-flight PENDING payouts). Clamped
 * at 0 so an over-accounted creator never shows a negative balance.
 */
export function computeUnpaidCents(
  allTimeEarningsCents: number,
  accountedCents: number
): number {
  const earned = Number.isFinite(allTimeEarningsCents) ? allTimeEarningsCents : 0;
  const accounted = Number.isFinite(accountedCents) ? accountedCents : 0;
  return Math.max(0, earned - accounted);
}

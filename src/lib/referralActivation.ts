import { grantReferralRewardOnVipActivation } from "@/lib/referral";
import { trackReferralRewardGrantedServer } from "@/lib/analyticsServer";

/**
 * Pay a pending referral when the referred user has an ACTIVE VIP subscription,
 * and emit the reward analytics. Called from EVERY place a subscription can
 * reach VIP — not just fresh first-activation, but also in-place upgrades
 * (GA→VIP) and the nightly reconcile sweeps — so a referral is never silently
 * lost when the referred user arrives at VIP by a path other than a brand-new
 * checkout.
 *
 * TWO hard gates: the tier must be VIP AND the subscription must be ACTIVE. The
 * reward is only ever paid for a live, paid subscription — never on signup, an
 * incomplete/unpaid checkout, a past_due (dunning) sub, or a canceled one. A
 * dunning sub that recovers to active is caught by the next active sweep.
 *
 * The underlying grant is idempotent (the referral's rewardedAt terminal
 * marker) and never throws, so calling this on every VIP-active sync / sweep is
 * a safe no-op once the referral is resolved or when there is no pending
 * referral. Decoupling it from the once-per-subscription credit-grant marker is
 * exactly what makes a transient grant failure recoverable on a later pass.
 */
export async function grantReferralRewardIfVip(
  referredUserId: string,
  tierName: string,
  // Whether the subscription is currently ACTIVE (provider-authoritative:
  // Stripe status === "active", PayPal status === "ACTIVE"). The reward is
  // withheld unless this is true — payout happens only for a live subscription.
  isActive: boolean,
  via: "webhook" | "reconcile" | "return" | "cron",
  // When the VIP subscription became active (the subscription's start time),
  // so a deferred/backstopped grant measures the reward window against the
  // actual activation rather than wall-clock-at-grant. Optional; defaults to now.
  activatedAt?: Date
): Promise<void> {
  if (tierName !== "VIP" || !isActive) return;
  const reward = await grantReferralRewardOnVipActivation(referredUserId, activatedAt);
  if (reward.granted) {
    trackReferralRewardGrantedServer({
      referredUserId,
      referrerId: reward.referrerId!,
      referredCredits: reward.referredCredits ?? 0,
      referrerCredits: reward.referrerCredits ?? 0,
      referrerCashCents: reward.referrerCashCents ?? 0,
      rewardSkippedReason: reward.reason ?? null,
      via,
    });
  }
}

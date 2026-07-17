import { prisma } from "@/lib/prisma";
import {
  generateReferralCode,
  normalizeReferralCode,
  MAX_REWARDED_REFERRALS_PER_MONTH,
  REFERRAL_REWARD_WINDOW_DAYS,
  REFERRED_SIGNUP_CREDITS,
  REFERRER_REWARD_CREDITS,
  CREATOR_REFERRER_REWARD_CENTS,
} from "@/lib/referralCode";

/**
 * Referral program — DB side. Two-phase lifecycle:
 *
 * 1. RECORD (at signup) — recordReferralForNewUser, called from the two
 *    user-creation paths (/callback and /api/user/me) once the account exists
 *    with a verified email. Creates a PENDING referral row (rewardedAt = null,
 *    reward amounts 0). For a CREATOR referral it also unlocks the VIP lifetime
 *    discount on the referred account (users.vipOfferUnlockedAt) so they can
 *    subscribe at the discounted price. The unique referred_user_id makes a
 *    signup race harmless — one insert wins, the loser P2002s and no-ops. NO
 *    credits or cash are granted here.
 *
 * 2. GRANT (at VIP activation) — grantReferralRewardOnVipActivation, called
 *    from every subscription-activation site when the referred user activates a
 *    VIP subscription within REFERRAL_REWARD_WINDOW_DAYS of signup. Only then
 *    are rewards paid:
 *      USER/MOD/ADMIN referrer → REFERRER_REWARD_CREDITS to the referrer AND
 *                                REFERRED_SIGNUP_CREDITS to the referred user.
 *      CREATOR referrer        → flat CREATOR_REFERRER_REWARD_CENTS ($10) payout
 *                                cash to the creator (the referred user already
 *                                got the VIP discount at record time).
 *    The monthly cap withholds only the referrer reward. rewardedAt is the
 *    exactly-once terminal marker across activation paths and retries.
 */

/**
 * Get the user's referral code, allocating one on first use. Retries on the
 * (astronomically unlikely) code collision; uses a guarded updateMany so a
 * concurrent request can't clobber an already-allocated code.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const claimed = await prisma.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });
      if (claimed.count === 1) return code;

      // Someone else won the race (or the user vanished) — read what's there.
      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (after?.referralCode) return after.referralCode;
      throw new Error("User not found while allocating referral code");
    } catch (e) {
      // Unique collision on the code itself — regenerate and retry.
      if (isP2002(e)) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a unique referral code");
}

export type ReferralRecord = {
  recorded: boolean;
  /** Why nothing was recorded (no_code, unknown_code, self_referral, …). */
  reason?: string;
  referralId?: string;
  referrerId?: string;
  referrerRole?: string;
  /** True when this is a creator referral — the referred user was VIP-unlocked. */
  referredVipOffer?: boolean;
};

/**
 * Record a PENDING referral for a brand-new user (no rewards granted — those
 * wait for VIP activation). For a creator referral, unlocks the VIP lifetime
 * discount on the referred account so they can subscribe at the discount.
 * NEVER throws — a broken referral must not break signup.
 *
 * Callers must ensure the user row was just created and the email is verified
 * (mirrors the invite systems' emailConfirmed gate).
 */
export async function recordReferralForNewUser(params: {
  code: string | null | undefined;
  newUserId: string;
}): Promise<ReferralRecord> {
  try {
    const code = normalizeReferralCode(params.code);
    if (!code) return { recorded: false, reason: "no_code" };

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, role: true, isActive: true, isFlagged: true },
    });
    if (!referrer) return { recorded: false, reason: "unknown_code" };
    if (referrer.id === params.newUserId) {
      return { recorded: false, reason: "self_referral" };
    }
    if (!referrer.isActive || referrer.isFlagged) {
      return { recorded: false, reason: "referrer_ineligible" };
    }

    // Snapshot the referrer-was-a-creator decision so the reward type (and the
    // referred user's VIP unlock) match what the signup banner promised, even
    // if the referrer's role changes before the referred user subscribes.
    const isCreator = referrer.role === "CREATOR";

    const row = await prisma.$transaction(async (tx) => {
      // Exactly-once guard: unique referred_user_id. A concurrent record (or a
      // replayed callback) for the SAME new user conflicts here and rolls back.
      const created = await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredUserId: params.newUserId,
          referredVipOffer: isCreator,
          // rewardedAt null, amounts 0 — resolved at VIP activation.
        },
      });
      if (isCreator) {
        // Permanent account unlock — the checkout routes honor it alongside the
        // gr_vip_offer cookie; never-paid eligibility still gates the discount.
        await tx.user.update({
          where: { id: params.newUserId },
          data: { vipOfferUnlockedAt: new Date() },
        });
      }
      return created;
    });

    return {
      recorded: true,
      referralId: row.id,
      referrerId: referrer.id,
      referrerRole: referrer.role,
      referredVipOffer: isCreator,
    };
  } catch (e) {
    if (isP2002(e)) return { recorded: false, reason: "already_recorded" };
    console.error("recordReferralForNewUser failed:", e);
    return { recorded: false, reason: "error" };
  }
}

export type ReferralReward = {
  granted: boolean;
  /** no_pending | already_resolved | expired | referrer_ineligible | monthly_cap | error */
  reason?: string;
  referralId?: string;
  referrerId?: string;
  referredCredits?: number;
  referrerCredits?: number;
  referrerCashCents?: number;
};

/**
 * Grant a pending referral's rewards when the referred user activates a VIP
 * subscription. Idempotent (rewardedAt terminal marker) and NEVER throws, so it
 * is safe to call from every activation path (Stripe webhook, reconcile cron,
 * PayPal) and on retries. Caller must have confirmed the activated tier is VIP.
 *
 *   USER referral    → REFERRER_REWARD_CREDITS to the referrer, and
 *                      REFERRED_SIGNUP_CREDITS to the referred user.
 *   CREATOR referral → flat CREATOR_REFERRER_REWARD_CENTS payout cash to the
 *                      creator (referred user already has the VIP discount).
 * Withheld when: past the REFERRAL_REWARD_WINDOW_DAYS window ("expired"), the
 * referrer is now inactive/flagged ("referrer_ineligible"), or the referrer is
 * over the monthly cap ("monthly_cap" — referred credits still granted).
 */
export async function grantReferralRewardOnVipActivation(
  referredUserId: string,
  // When the referred user's VIP subscription actually became active. The
  // window is measured against THIS, not wall-clock-at-grant, so a legitimate
  // within-window activation that is only paid later by a backstop (nightly
  // reconcile cron, a delayed webhook/PayPal retry) is NOT falsely expired.
  // Defaults to now for the immediate-activation paths where grant ≈ activation.
  activatedAt?: Date
): Promise<ReferralReward> {
  try {
    // Cheap pre-check — most VIP activations aren't referrals, so skip the tx.
    const pending = await prisma.referral.findFirst({
      where: { referredUserId, rewardedAt: null },
      select: { id: true, referrerId: true, referredVipOffer: true, createdAt: true },
    });
    if (!pending) return { granted: false, reason: "no_pending" };

    const referrer = await prisma.user.findUnique({
      where: { id: pending.referrerId },
      select: { isActive: true, isFlagged: true },
    });

    const now = new Date();
    const activationTime = activatedAt ?? now;
    const expired =
      activationTime.getTime() - pending.createdAt.getTime() >
      REFERRAL_REWARD_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const result = await prisma.$transaction(async (tx) => {
      // Per-referrer advisory lock: serializes the monthly-cap count across
      // concurrent activations of DIFFERENT referred users of the same referrer,
      // and (together with the rewardedAt check below) makes the grant for the
      // SAME referred user exactly-once across activation paths/retries.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pending.referrerId})::bigint)`;

      const row = await tx.referral.findUnique({ where: { id: pending.id } });
      if (!row || row.rewardedAt != null) return { claimed: false };

      // Resolve with no grant when the window has passed or the referrer is no
      // longer eligible. rewardedAt is still set so it's terminal (won't be
      // reprocessed on a later activation).
      if (expired || !referrer || !referrer.isActive || referrer.isFlagged) {
        const reason = expired ? "expired" : "referrer_ineligible";
        await tx.referral.update({
          where: { id: row.id },
          data: { rewardedAt: now, referrerRewardSkippedReason: reason },
        });
        return { claimed: true, granted: false, reason };
      }

      const isCreator = row.referredVipOffer;
      const referredCredits = isCreator ? 0 : REFERRED_SIGNUP_CREDITS;
      let referrerCredits = isCreator ? 0 : REFERRER_REWARD_CREDITS;
      let referrerCashCents = isCreator ? CREATOR_REFERRER_REWARD_CENTS : 0;

      // Monthly cap on the REFERRER reward — count referrals whose referrer
      // reward was already granted this month (rewardedAt set, not skipped).
      // The current row is still pending here, so it isn't self-counted.
      const rewardedThisMonth = await tx.referral.count({
        where: {
          referrerId: row.referrerId,
          rewardedAt: { gte: monthStart },
          referrerRewardSkippedReason: null,
        },
      });
      let skippedReason: string | null = null;
      if (rewardedThisMonth >= MAX_REWARDED_REFERRALS_PER_MONTH) {
        skippedReason = "monthly_cap";
        referrerCredits = 0;
        referrerCashCents = 0;
      }

      await tx.referral.update({
        where: { id: row.id },
        data: {
          rewardedAt: now,
          referredCredits,
          referrerCredits,
          referrerCashCents,
          referrerRewardSkippedReason: skippedReason,
        },
      });

      // Referred user's credits (USER referral only).
      if (referredCredits > 0) {
        await tx.creditBalance.upsert({
          where: { userId: referredUserId },
          create: { userId: referredUserId, balance: referredCredits },
          update: { balance: { increment: referredCredits } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: referredUserId,
            amount: referredCredits,
            type: "REFERRAL",
            referenceId: row.id,
            note: "Referral bonus — you subscribed via a referral",
          },
        });
      }
      // Referrer's credits (USER referral only).
      if (referrerCredits > 0) {
        await tx.creditBalance.upsert({
          where: { userId: row.referrerId },
          create: { userId: row.referrerId, balance: referrerCredits },
          update: { balance: { increment: referrerCredits } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: row.referrerId,
            amount: referrerCredits,
            type: "REFERRAL",
            referenceId: row.id,
            note: "Referral reward — your referral subscribed",
          },
        });
      }
      // A CREATOR's cash reward needs no write beyond the referral row itself:
      // referrerCashCents is picked up by the payout unpaid-balance math.

      return {
        claimed: true,
        granted: true,
        referrerId: row.referrerId,
        referredCredits,
        referrerCredits,
        referrerCashCents,
        skippedReason,
      };
    });

    if (!result.claimed) return { granted: false, reason: "already_resolved" };
    if (!result.granted) return { granted: false, reason: result.reason };
    return {
      granted: true,
      reason: result.skippedReason ?? undefined,
      referralId: pending.id,
      referrerId: result.referrerId,
      referredCredits: result.referredCredits,
      referrerCredits: result.referrerCredits,
      referrerCashCents: result.referrerCashCents,
    };
  } catch (e) {
    console.error("grantReferralRewardOnVipActivation failed:", e);
    return { granted: false, reason: "error" };
  }
}

/** Aggregate lifetime referral stats for the referral panel. */
export async function getReferralStats(userId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [totals, converted, rewardedThisMonth] = await Promise.all([
    // Sums count only rewarded rows (pending rows have amounts 0).
    prisma.referral.aggregate({
      where: { referrerId: userId },
      _count: { _all: true },
      _sum: { referrerCredits: true, referrerCashCents: true },
    }),
    // Referrals whose referred user subscribed to VIP (any resolved referral —
    // rewardedAt is set only by a VIP activation, incl. cap/expiry cases).
    prisma.referral.count({
      where: { referrerId: userId, rewardedAt: { not: null } },
    }),
    prisma.referral.count({
      where: {
        referrerId: userId,
        rewardedAt: { gte: monthStart },
        referrerRewardSkippedReason: null,
      },
    }),
  ]);

  return {
    // Total signups via the link (includes pending, not-yet-subscribed).
    totalReferrals: totals._count._all,
    // Referrals that converted to a VIP subscription and paid out.
    convertedReferrals: converted,
    creditsEarned: totals._sum.referrerCredits ?? 0,
    cashCentsEarned: totals._sum.referrerCashCents ?? 0,
    rewardedThisMonth,
    monthlyRewardCap: MAX_REWARDED_REFERRALS_PER_MONTH,
  };
}

function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

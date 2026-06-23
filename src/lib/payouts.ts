import { prisma } from "@/lib/prisma";
import {
  computePayoutCents,
  resolveCentsPerCredit,
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
} from "@/lib/payoutMath";

/**
 * Single source of truth for creator payouts.
 *
 * The money math lives in `payoutMath.ts` (pure + unit-tested). This module
 * adds the DB lookups: the per-creator rate override (`customPayoutRate`, in
 * cents-per-credit), the platform default (`PlatformSetting.creatorPayoutRate`,
 * also cents-per-credit), and the credits actually earned — counting BOTH sample
 * and preset purchases (counting only samples is what previously left preset
 * sales unpaid).
 *
 * Every payout path (monthly cron, admin execution, creator earnings display)
 * MUST go through these helpers so the displayed estimate and the real transfer
 * can never diverge again.
 */

type PayoutConfig = {
  /** Effective per-creator rate in cents per credit (e.g. 7 = $0.07/credit). */
  centsPerCredit: number;
  /** True when the creator has an explicit override (not the platform default). */
  isCustomRate: boolean;
};

/** Resolve the effective payout configuration for a creator. */
export async function getCreatorPayoutConfig(
  creatorId: string
): Promise<PayoutConfig> {
  const [settings, creator] = await Promise.all([
    prisma.platformSetting.findFirst({
      select: { creatorPayoutRate: true },
    }),
    prisma.user.findUnique({
      where: { id: creatorId },
      select: { customPayoutRate: true },
    }),
  ]);

  const platformDefaultCents =
    settings?.creatorPayoutRate ?? DEFAULT_PAYOUT_CENTS_PER_CREDIT;
  const centsPerCredit = resolveCentsPerCredit(
    creator?.customPayoutRate,
    platformDefaultCents
  );

  return {
    centsPerCredit,
    isCustomRate: creator?.customPayoutRate != null,
  };
}

/**
 * Calculate creator earnings in whole cents for a given number of credits.
 * amount = floor(credits × centsPerCredit)
 */
export async function calculateCreatorEarningsCents(
  creatorId: string,
  creditsEarned: number
): Promise<number> {
  const cfg = await getCreatorPayoutConfig(creatorId);
  return computePayoutCents(creditsEarned, cfg.centsPerCredit);
}

/**
 * Total credits spent on a creator's ENTIRE catalog — samples AND presets — in
 * an optional time window. Use this everywhere payouts/earnings are computed so
 * preset sales are always included.
 */
export async function getCreatorCreditsSpent(
  creatorId: string,
  range?: { gte?: Date; lt?: Date; lte?: Date }
): Promise<number> {
  const [samples, presets] = await Promise.all([
    prisma.sample.findMany({ where: { creatorId }, select: { id: true } }),
    prisma.preset.findMany({ where: { creatorId }, select: { id: true } }),
  ]);

  const sampleIds = samples.map((s) => s.id);
  const presetIds = presets.map((p) => p.id);
  if (sampleIds.length === 0 && presetIds.length === 0) return 0;

  const itemFilter: { sampleId?: { in: string[] }; presetId?: { in: string[] } }[] = [];
  if (sampleIds.length) itemFilter.push({ sampleId: { in: sampleIds } });
  if (presetIds.length) itemFilter.push({ presetId: { in: presetIds } });

  const purchases = await prisma.purchase.findMany({
    where: {
      OR: itemFilter,
      ...(range ? { createdAt: range } : {}),
    },
    select: { creditsSpent: true },
  });

  return purchases.reduce((sum, p) => sum + p.creditsSpent, 0);
}

/**
 * Display-friendly earnings info for a creator. Field names kept stable for the
 * earnings UI (`centsPerCredit`, `perCreditDisplay`, `isCustomRate`).
 */
export async function getCreatorEarningsInfo(creatorId: string) {
  const cfg = await getCreatorPayoutConfig(creatorId);
  return {
    centsPerCredit: cfg.centsPerCredit,
    isCustomRate: cfg.isCustomRate,
    perCreditDisplay: `$${(cfg.centsPerCredit / 100).toFixed(2)}`,
  };
}

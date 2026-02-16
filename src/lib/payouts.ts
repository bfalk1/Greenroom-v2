import { prisma } from "@/lib/prisma";

/**
 * Get the effective payout rate for a creator.
 * Uses creator's custom rate if set, otherwise falls back to platform default.
 */
export async function getCreatorPayoutConfig(creatorId: string) {
  // Get platform settings
  const platformSettings = await prisma.platformSetting.findUnique({
    where: { id: "default" },
  });

  const platformRate = platformSettings?.creatorPayoutRate ?? 70;
  const creditValueCents = platformSettings?.creditValueCents ?? 10;

  // Get creator's custom rate if set
  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { payoutRate: true },
  });

  const effectiveRate = creator?.payoutRate ?? platformRate;

  return {
    platformRate,
    creatorRate: creator?.payoutRate,
    effectiveRate,
    creditValueCents,
  };
}

/**
 * Calculate creator earnings in cents for a given number of credits.
 * Formula: credits * creditValueCents * (payoutRate / 100)
 */
export async function calculateCreatorEarningsCents(
  creatorId: string,
  creditsEarned: number
): Promise<number> {
  const config = await getCreatorPayoutConfig(creatorId);
  
  // credits * creditValueCents * (rate / 100)
  // e.g., 100 credits * 10 cents * 70% = 700 cents = $7.00
  const earningsCents = Math.floor(
    creditsEarned * config.creditValueCents * (config.effectiveRate / 100)
  );

  return earningsCents;
}

/**
 * Get a breakdown of earnings info for display
 */
export async function getCreatorEarningsInfo(creatorId: string) {
  const config = await getCreatorPayoutConfig(creatorId);
  
  // Calculate per-credit earnings in cents
  const perCreditCents = config.creditValueCents * (config.effectiveRate / 100);
  
  return {
    ...config,
    perCreditCents,
    perCreditDisplay: `$${(perCreditCents / 100).toFixed(3)}`,
    rateDisplay: `${config.effectiveRate}%`,
    isCustomRate: config.creatorRate !== null && config.creatorRate !== undefined,
  };
}

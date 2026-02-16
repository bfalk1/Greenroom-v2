import { prisma } from "@/lib/prisma";

// Default payout: $0.03 per credit (3 cents)
const DEFAULT_PAYOUT_CENTS_PER_CREDIT = 3;

/**
 * Get the effective payout rate for a creator (in cents per credit).
 * Uses creator's custom rate if set by admin, otherwise $0.03/credit.
 * 
 * The payoutRate field stores cents per credit (e.g., 3 = $0.03, 5 = $0.05)
 */
export async function getCreatorPayoutConfig(creatorId: string) {
  // Get creator's custom rate if set
  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { payoutRate: true },
  });

  const centsPerCredit = creator?.payoutRate ?? DEFAULT_PAYOUT_CENTS_PER_CREDIT;

  return {
    defaultRate: DEFAULT_PAYOUT_CENTS_PER_CREDIT,
    customRate: creator?.payoutRate,
    centsPerCredit,
    isCustomRate: creator?.payoutRate !== null && creator?.payoutRate !== undefined,
  };
}

/**
 * Calculate creator earnings in cents for a given number of credits.
 * Formula: credits * centsPerCredit
 * Default: $0.03 per credit
 */
export async function calculateCreatorEarningsCents(
  creatorId: string,
  creditsEarned: number
): Promise<number> {
  const config = await getCreatorPayoutConfig(creatorId);
  
  // Simple: credits * cents per credit
  // e.g., 100 credits * 3 cents = 300 cents = $3.00
  return creditsEarned * config.centsPerCredit;
}

/**
 * Get a breakdown of earnings info for display
 */
export async function getCreatorEarningsInfo(creatorId: string) {
  const config = await getCreatorPayoutConfig(creatorId);
  
  return {
    ...config,
    perCreditDisplay: `$${(config.centsPerCredit / 100).toFixed(2)}`,
  };
}

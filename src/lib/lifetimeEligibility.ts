import { prisma } from "@/lib/prisma";

/**
 * Lifetime-offer eligibility: the $11.99 VIP price is for accounts that have
 * never PAID for a subscription. "Paid" means a subscriptions row backed by a
 * provider id — beta-comp accounts (invite bypass sets only the
 * users.subscription_status flag, no row) and seeded rows without an external
 * id stay eligible. Deliberately NOT the users.subscription_status flag: that
 * flag is set by comps and has drifted stale before (see the July 2026
 * subscriber-count incident).
 *
 * Single source of truth for the rule — used by /api/user/subscription (what
 * the checkout UI displays) and both checkout API routes (what the server
 * enforces), so the price a buyer is shown is always the price they're
 * charged.
 */
export async function isLifetimeEligible(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, paypalSubscriptionId: true },
  });
  if (!sub) return true;
  return !sub.stripeSubscriptionId && !sub.paypalSubscriptionId;
}

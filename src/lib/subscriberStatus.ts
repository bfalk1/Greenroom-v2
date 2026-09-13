import type { Prisma } from "@prisma/client";

/**
 * Where a paid subscription stands right now. Every subscriber count — the
 * admin Subscribers dashboard, the analytics Overview, the MRR snapshot — goes
 * through these rules, so no two screens can disagree about who is paying.
 *
 * Two records decide it together: the subscriptions row's currentPeriodEnd
 * (how far the provider has opened the billing period) and the owner's
 * users.subscription_status (what the provider last said about payment). The
 * period alone overstates "paying": when a renewal charge fails, Stripe still
 * opens the next period and the webhook copies its dates, so an unpaid sub
 * looks paid through next month.
 *
 * - paying  — period open, no failed payment or cancellation reported.
 * - failing — period open, but the renewal charge failed (past_due) and the
 *             provider is retrying. Not paying; back to paying if a retry
 *             succeeds. (The paywall still lets these users in meanwhile.)
 * - ended   — the period ran out, or the provider canceled.
 */
export type SubscriberState = "paying" | "failing" | "ended";

/** users.subscription_status once a renewal charge has failed. */
export const PAYMENT_FAILED_STATUS = "past_due";

/** users.subscription_status once the provider has ended the subscription. */
export const CANCELED_STATUS = "canceled";

export interface SubscriberStateInput {
  currentPeriodEnd: Date;
  /** users.subscription_status of the subscription's owner. */
  userStatus: string | null;
}

export function subscriberState(
  sub: SubscriberStateInput,
  now: Date
): SubscriberState {
  if (sub.currentPeriodEnd < now) return "ended";
  if (sub.userStatus === CANCELED_STATUS) return "ended";
  if (sub.userStatus === PAYMENT_FAILED_STATUS) return "failing";
  return "paying";
}

/** A row only counts as real billing if a provider actually backs it. */
export const PROVIDER_BACKED: Prisma.SubscriptionWhereInput = {
  OR: [
    { stripeSubscriptionId: { not: null } },
    { paypalSubscriptionId: { not: null } },
  ],
};

/**
 * subscriberState() as a Prisma filter, for counts and paginated lists — keep
 * the two in step. Everything sits under AND so callers can add their own
 * conditions without overwriting these keys.
 */
export function subscriberStateWhere(
  state: SubscriberState,
  now: Date
): Prisma.SubscriptionWhereInput {
  switch (state) {
    case "paying":
      return {
        AND: [
          PROVIDER_BACKED,
          { currentPeriodEnd: { gte: now } },
          {
            user: {
              OR: [
                { subscriptionStatus: null },
                {
                  subscriptionStatus: {
                    notIn: [PAYMENT_FAILED_STATUS, CANCELED_STATUS],
                  },
                },
              ],
            },
          },
        ],
      };
    case "failing":
      return {
        AND: [
          PROVIDER_BACKED,
          { currentPeriodEnd: { gte: now } },
          { user: { subscriptionStatus: PAYMENT_FAILED_STATUS } },
        ],
      };
    case "ended":
      return {
        AND: [
          PROVIDER_BACKED,
          {
            OR: [
              { currentPeriodEnd: { lt: now } },
              { user: { subscriptionStatus: CANCELED_STATUS } },
            ],
          },
        ],
      };
  }
}

// ── Movement ────────────────────────────────────────────────────────────────

export const MOVEMENT_WINDOWS = [
  { key: "last24h", days: 1 },
  { key: "last7d", days: 7 },
  { key: "last30d", days: 30 },
] as const;

export type WindowKey = (typeof MOVEMENT_WINDOWS)[number]["key"];
export type WindowCounts = Record<WindowKey, number>;

export function emptyWindowCounts(): WindowCounts {
  return { last24h: 0, last7d: 0, last30d: 0 };
}

/** Start of the rolling window of `days` that ends at `now`. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export interface MovementInput extends SubscriberStateInput {
  createdAt: Date;
  currentPeriodStart: Date;
}

/**
 * When a subscription stopped counting as paying — null while it still counts,
 * or when that moment was never recorded.
 *
 * - A period that ran out without renewing stopped at its end.
 * - A failed renewal stopped when the unpaid period opened: Stripe opens the
 *   period first, then the charge fails.
 * - A cancellation that left the period open has no recorded moment. The
 *   Stripe webhook closes the period when it cancels, so only rows written
 *   before it did look like this; they leave Paying without landing in a
 *   window.
 */
export function stoppedPayingAt(sub: MovementInput, now: Date): Date | null {
  const state = subscriberState(sub, now);
  if (state === "paying") return null;
  if (sub.currentPeriodEnd < now) return sub.currentPeriodEnd;
  if (state === "failing") return sub.currentPeriodStart;
  return null;
}

export interface SubscriberMovement {
  /** Subscriptions that started in the window. */
  started: WindowCounts;
  /** Ended in the window: the period ran out, or the provider canceled. */
  ended: WindowCounts;
  /** Renewals whose charge failed in the window and haven't recovered. */
  paymentFailed: WindowCounts;
  /** started − ended − paymentFailed: how far Paying moved over the window. */
  net: WindowCounts;
}

/**
 * How Paying moved over each rolling window. `rows` must hold every
 * subscription that started or stopped paying within the widest window;
 * anything left out simply isn't counted.
 *
 * Net matches Paying's real change except for two moves no row records: a
 * subscriber who comes back on their old row, and a failed renewal from before
 * the window that recovered inside it. Both are rare, so Net lands within a
 * sub or two.
 */
export function subscriberMovement(
  rows: MovementInput[],
  now: Date
): SubscriberMovement {
  const started = emptyWindowCounts();
  const ended = emptyWindowCounts();
  const paymentFailed = emptyWindowCounts();

  for (const row of rows) {
    const stoppedAt = stoppedPayingAt(row, now);
    const failing = subscriberState(row, now) === "failing";
    for (const w of MOVEMENT_WINDOWS) {
      const from = windowStart(now, w.days);
      if (row.createdAt >= from) started[w.key]++;
      if (stoppedAt && stoppedAt >= from) {
        if (failing) paymentFailed[w.key]++;
        else ended[w.key]++;
      }
    }
  }

  const net = emptyWindowCounts();
  for (const w of MOVEMENT_WINDOWS) {
    net[w.key] = started[w.key] - ended[w.key] - paymentFailed[w.key];
  }
  return { started, ended, paymentFailed, net };
}

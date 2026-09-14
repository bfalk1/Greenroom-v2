import {
  stoppedPayingAt,
  subscriberState,
  windowStart,
  type MovementInput,
} from "./subscriberStatus";

/**
 * How long subscribers stay — the "average lifetime" on the admin Subscribers
 * dashboard. Two views, because neither alone is honest on a young base:
 *
 * - Observed tenure. A paying sub is measured from its first checkout to now
 *   (still counting); an ended one from checkout to the end of its last paid
 *   period. These means can never exceed the age of the oldest subscription,
 *   so while the base is young they say more about when people signed up
 *   than about how long they stay.
 * - Expected lifetime from churn. Of the subs paying 30 days ago, the share
 *   that has since stopped is the monthly churn rate, and window ÷ rate is
 *   the mean lifetime that churn produces — the standard LTV input. It moves
 *   with the last 30 days, so a bad month shows up at once.
 *
 * Payment-failing subs are in neither observed group: they stopped paying but
 * may recover on a retry, so their lifetime isn't known yet. They do count
 * as churn once the failure lands inside the window, matching
 * subscriberMovement().
 *
 * The subscriptions row is one per user and reused when someone comes back,
 * so createdAt is the FIRST checkout: a returning subscriber's tenure spans
 * the gap. Rare (about one a month), and the roster's Started column reads
 * the same date.
 */

export const DAY_MS = 86_400_000;

/** Churn is measured over this rolling window, in days. */
export const CHURN_WINDOW_DAYS = 30;

export interface LifetimeStats {
  /** Subscriptions in the group. */
  count: number;
  meanDays: number | null;
  medianDays: number | null;
  maxDays: number | null;
}

export interface SubscriberLifetime {
  /** Currently paying: how long they've been subscribed so far. */
  paying: LifetimeStats;
  /** Ended: how long they stayed, checkout to the end of the last paid period. */
  ended: LifetimeStats;
  /** Both groups together: the plain average time subscribed per subscriber. */
  all: LifetimeStats;
  churn: {
    windowDays: number;
    /** Subs that were paying when the window opened. */
    payingAtStart: number;
    /** Of those, how many stopped paying inside the window. */
    stopped: number;
    /** stopped ÷ payingAtStart as a percentage; null with nobody at start. */
    ratePct: number | null;
    /** Mean lifetime at this churn, in days; null when nobody stopped. */
    expectedDays: number | null;
  };
}

function summarize(days: number[]): LifetimeStats {
  if (days.length === 0) {
    return { count: 0, meanDays: null, medianDays: null, maxDays: null };
  }
  const sorted = [...days].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, d) => sum + d, 0) / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { count: n, meanDays: mean, medianDays: median, maxDays: sorted[n - 1] };
}

/**
 * Days from first checkout to `until`, never negative — a period that closed
 * before its row was created is bad data, not a negative lifetime.
 */
function tenureDays(createdAt: Date, until: Date): number {
  return Math.max(0, (until.getTime() - createdAt.getTime()) / DAY_MS);
}

/**
 * `rows` must hold every subscription that is paying now or has ended, plus
 * anything that stopped paying inside the churn window; anything left out
 * simply isn't counted.
 */
export function subscriberLifetime(
  rows: MovementInput[],
  now: Date
): SubscriberLifetime {
  const paying: number[] = [];
  const ended: number[] = [];
  const from = windowStart(now, CHURN_WINDOW_DAYS);
  let payingAtStart = 0;
  let stopped = 0;

  for (const row of rows) {
    const state = subscriberState(row, now);
    if (state === "paying") {
      paying.push(tenureDays(row.createdAt, now));
    } else if (state === "ended") {
      // Paid through the period end — or only through now, when the provider
      // canceled with time still left on the period.
      const until = row.currentPeriodEnd < now ? row.currentPeriodEnd : now;
      ended.push(tenureDays(row.createdAt, until));
    }

    // Churn: of the subs paying when the window opened, how many stopped
    // since. A sub that started inside the window wasn't there at the start,
    // whatever it did afterwards.
    if (row.createdAt >= from) continue;
    if (state === "paying") {
      payingAtStart++;
    } else {
      const stoppedAt = stoppedPayingAt(row, now);
      if (stoppedAt && stoppedAt >= from) {
        payingAtStart++;
        stopped++;
      }
    }
  }

  return {
    paying: summarize(paying),
    ended: summarize(ended),
    all: summarize([...paying, ...ended]),
    churn: {
      windowDays: CHURN_WINDOW_DAYS,
      payingAtStart,
      stopped,
      ratePct: payingAtStart > 0 ? (stopped / payingAtStart) * 100 : null,
      expectedDays:
        payingAtStart > 0 && stopped > 0
          ? (CHURN_WINDOW_DAYS * payingAtStart) / stopped
          : null,
    },
  };
}

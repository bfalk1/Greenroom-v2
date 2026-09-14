import { test } from "node:test";
import assert from "node:assert/strict";
import { CHURN_WINDOW_DAYS, subscriberLifetime } from "./subscriberLifetime";
import { CANCELED_STATUS, PAYMENT_FAILED_STATUS } from "./subscriberStatus";

// The "average subscriber lifetime" on the admin Subscribers dashboard. Pin
// which subs land in which group, how each is measured, and the churn
// arithmetic the headline figure comes from.

const now = new Date("2026-09-14T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

/** Checked out `age` days ago; the current period ends `periodEnd` days from now. */
const sub = (age: number, periodEnd: number, userStatus: string | null = "active") => ({
  createdAt: days(-age),
  currentPeriodStart: days(periodEnd - 30),
  currentPeriodEnd: days(periodEnd),
  userStatus,
});

test("paying subs are measured from checkout to now, still counting", () => {
  const lt = subscriberLifetime([sub(10, 20), sub(40, 5), sub(70, 25)], now);
  assert.deepEqual(lt.paying, { count: 3, meanDays: 40, medianDays: 40, maxDays: 70 });
  assert.deepEqual(lt.ended, { count: 0, meanDays: null, medianDays: null, maxDays: null });
});

test("ended subs are measured to the end of their last paid period", () => {
  // Both ran out 5 days ago: 30 and 60 days of paid time.
  const lt = subscriberLifetime([sub(35, -5), sub(65, -5)], now);
  assert.deepEqual(lt.ended, { count: 2, meanDays: 45, medianDays: 45, maxDays: 60 });
  assert.equal(lt.paying.count, 0);
});

test("a provider cancellation with time left counts only the time up to now", () => {
  const lt = subscriberLifetime([sub(40, 20, CANCELED_STATUS)], now);
  assert.equal(lt.ended.count, 1);
  assert.equal(lt.ended.meanDays, 40);
});

test("a period closed before its row was created reads as zero, not negative", () => {
  const bad = {
    createdAt: days(-10),
    currentPeriodStart: days(-40),
    currentPeriodEnd: days(-11),
    userStatus: "active",
  };
  assert.equal(subscriberLifetime([bad], now).ended.meanDays, 0);
});

test("payment-failing subs are in neither observed group", () => {
  const lt = subscriberLifetime([sub(31, 25, PAYMENT_FAILED_STATUS)], now);
  assert.equal(lt.paying.count, 0);
  assert.equal(lt.ended.count, 0);
  assert.equal(lt.all.count, 0);
});

test("all = paying and ended together; an even count's median averages the middle pair", () => {
  // paying: 10, 30 days so far · ended: 40, 70 days
  const lt = subscriberLifetime([sub(10, 20), sub(30, 20), sub(45, -5), sub(75, -5)], now);
  assert.deepEqual(lt.all, { count: 4, meanDays: 37.5, medianDays: 35, maxDays: 70 });
});

test("churn: of the subs paying 30 days ago, the share that has since stopped", () => {
  const rows = [
    sub(60, 20), // paying then, paying now
    sub(60, -10), // paying then, ran out inside the window
    sub(60, 15, PAYMENT_FAILED_STATUS), // paying then, renewal failed 15 days ago
    sub(60, -40), // ended before the window opened: wasn't there at the start
    sub(10, 20), // started inside the window: not there at the start
    sub(5, -1), // started AND ended inside the window: not there either
    {
      // Renewal failed 35 days ago and still retrying: stopped before the window.
      createdAt: days(-90),
      currentPeriodStart: days(-35),
      currentPeriodEnd: days(25),
      userStatus: PAYMENT_FAILED_STATUS,
    },
  ];
  const lt = subscriberLifetime(rows, now);
  assert.equal(lt.churn.windowDays, CHURN_WINDOW_DAYS);
  assert.equal(lt.churn.payingAtStart, 3);
  assert.equal(lt.churn.stopped, 2);
  assert.equal(lt.churn.ratePct, (2 / 3) * 100);
  assert.equal(lt.churn.expectedDays, (30 * 3) / 2);
});

test("no churn projects no lifetime; nobody at the window start gives no rate at all", () => {
  const quiet = subscriberLifetime([sub(60, 20), sub(45, 10)], now);
  assert.equal(quiet.churn.payingAtStart, 2);
  assert.equal(quiet.churn.stopped, 0);
  assert.equal(quiet.churn.ratePct, 0);
  assert.equal(quiet.churn.expectedDays, null);

  const young = subscriberLifetime([sub(10, 20), sub(3, -1)], now);
  assert.equal(young.churn.payingAtStart, 0);
  assert.equal(young.churn.ratePct, null);
  assert.equal(young.churn.expectedDays, null);
});

test("an empty base yields zero counts and no averages", () => {
  const lt = subscriberLifetime([], now);
  assert.deepEqual(lt.paying, { count: 0, meanDays: null, medianDays: null, maxDays: null });
  assert.deepEqual(lt.all, lt.paying);
  assert.equal(lt.churn.expectedDays, null);
});

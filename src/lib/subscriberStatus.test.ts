import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCELED_STATUS,
  PAYMENT_FAILED_STATUS,
  stoppedPayingAt,
  subscriberMovement,
  subscriberState,
} from "./subscriberStatus";

// Every subscriber count on the admin dashboards runs through these rules.
// They replaced "paying = the billing period is still open", which kept
// counting renewals whose charge had failed as paying for another month. Pin
// the states, and the movement arithmetic that has to reconcile with Paying.

const now = new Date("2026-09-12T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);

test("an open period with nothing reported against it is paying", () => {
  assert.equal(
    subscriberState({ currentPeriodEnd: days(20), userStatus: "active" }, now),
    "paying"
  );
  // No status on file doesn't make a live period unpaid.
  assert.equal(
    subscriberState({ currentPeriodEnd: days(20), userStatus: null }, now),
    "paying"
  );
});

test("a failed renewal isn't paying, even with the period open", () => {
  assert.equal(
    subscriberState(
      { currentPeriodEnd: days(25), userStatus: PAYMENT_FAILED_STATUS },
      now
    ),
    "failing"
  );
});

test("a provider cancellation ends the sub even with time left on the period", () => {
  assert.equal(
    subscriberState(
      { currentPeriodEnd: days(15), userStatus: CANCELED_STATUS },
      now
    ),
    "ended"
  );
});

test("a period that ran out is ended whatever the status says", () => {
  for (const userStatus of ["active", PAYMENT_FAILED_STATUS, null]) {
    assert.equal(
      subscriberState({ currentPeriodEnd: days(-1), userStatus }, now),
      "ended"
    );
  }
});

test("the period still counts at the instant it ends", () => {
  // Same boundary as the currentPeriodEnd >= now filter behind the counts.
  assert.equal(
    subscriberState({ currentPeriodEnd: now, userStatus: "active" }, now),
    "paying"
  );
});

test("stoppedPayingAt dates each way out of Paying", () => {
  const sub = { createdAt: days(-60), currentPeriodStart: days(-10) };
  assert.equal(
    stoppedPayingAt(
      { ...sub, currentPeriodEnd: days(20), userStatus: "active" },
      now
    ),
    null
  );
  assert.deepEqual(
    stoppedPayingAt(
      { ...sub, currentPeriodEnd: days(-3), userStatus: CANCELED_STATUS },
      now
    ),
    days(-3)
  );
  // A failed renewal stopped paying when its unpaid period opened.
  assert.deepEqual(
    stoppedPayingAt(
      { ...sub, currentPeriodEnd: days(20), userStatus: PAYMENT_FAILED_STATUS },
      now
    ),
    days(-10)
  );
  // Cancelled with the period still open: no recorded moment.
  assert.equal(
    stoppedPayingAt(
      { ...sub, currentPeriodEnd: days(20), userStatus: CANCELED_STATUS },
      now
    ),
    null
  );
});

test("movement counts each flow in its windows and nets them", () => {
  const m = subscriberMovement(
    [
      // Signed up two hours ago.
      {
        createdAt: hoursAgo(2),
        currentPeriodStart: hoursAgo(2),
        currentPeriodEnd: days(30),
        userStatus: "active",
      },
      // Period ran out three days ago.
      {
        createdAt: days(-90),
        currentPeriodStart: days(-33),
        currentPeriodEnd: days(-3),
        userStatus: CANCELED_STATUS,
      },
      // Renewal charge failed ten days ago; still retrying.
      {
        createdAt: days(-70),
        currentPeriodStart: days(-10),
        currentPeriodEnd: days(20),
        userStatus: PAYMENT_FAILED_STATUS,
      },
      // Long-time subscriber who renewed fine: no movement.
      {
        createdAt: days(-200),
        currentPeriodStart: days(-5),
        currentPeriodEnd: days(25),
        userStatus: "active",
      },
      // Ended 40 days ago: before every window.
      {
        createdAt: days(-100),
        currentPeriodStart: days(-70),
        currentPeriodEnd: days(-40),
        userStatus: CANCELED_STATUS,
      },
    ],
    now
  );
  assert.deepEqual(m.started, { last24h: 1, last7d: 1, last30d: 1 });
  assert.deepEqual(m.ended, { last24h: 0, last7d: 1, last30d: 1 });
  assert.deepEqual(m.paymentFailed, { last24h: 0, last7d: 0, last30d: 1 });
  assert.deepEqual(m.net, { last24h: 1, last7d: 0, last30d: -1 });
});

test("a sub that starts and ends inside a window nets to zero there", () => {
  const m = subscriberMovement(
    [
      {
        createdAt: days(-5),
        currentPeriodStart: days(-5),
        currentPeriodEnd: days(-2),
        userStatus: CANCELED_STATUS,
      },
    ],
    now
  );
  assert.equal(m.started.last7d, 1);
  assert.equal(m.ended.last7d, 1);
  assert.equal(m.net.last7d, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripeCancellationScheduled } from "./cancellation";

// Stripe marks a scheduled cancellation one of two ways depending on the
// subscription's billing mode. Reading only cancel_at_period_end hid every
// customer-portal cancellation from the dashboard's "Canceling" count.

const PERIOD_END = 1_760_000_000;

test("classic billing mode: cancel_at_period_end marks it", () => {
  assert.equal(
    stripeCancellationScheduled({
      cancel_at_period_end: true,
      cancel_at: PERIOD_END,
    }),
    true
  );
});

test("flexible billing mode: cancel_at alone marks it", () => {
  // What a customer-portal cancellation looks like on our API version.
  assert.equal(
    stripeCancellationScheduled({
      cancel_at_period_end: false,
      cancel_at: PERIOD_END,
    }),
    true
  );
});

test("no cancellation, or one the customer took back, is a renewal", () => {
  assert.equal(
    stripeCancellationScheduled({ cancel_at_period_end: false, cancel_at: null }),
    false
  );
});

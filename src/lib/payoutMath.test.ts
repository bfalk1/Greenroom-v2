import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePayoutCents,
  resolveCentsPerCredit,
  computeUnpaidCents,
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
} from "./payoutMath";

test("default economics: 7¢ per credit", () => {
  // 100 credits × 7¢ = 700¢ = $7.00
  assert.equal(computePayoutCents(100, DEFAULT_PAYOUT_CENTS_PER_CREDIT), 700);
  // 1 credit at the default = 7¢
  assert.equal(computePayoutCents(1, 7), 7);
});

test("rate is cents-per-credit, NOT a percentage", () => {
  // The model: the stored rate is the literal cents paid per credit.
  // 100 credits × 5¢ = 500¢. (A percentage reading of "5" would give a wildly
  // different number — guard against ever reintroducing that.)
  assert.equal(computePayoutCents(100, 5), 500);
  assert.equal(computePayoutCents(100, 12), 1200);
});

test("custom rate overrides the platform default", () => {
  // 200 credits × 5¢ = 1000¢
  assert.equal(computePayoutCents(200, 5), 1000);
  // 200 credits × 10¢ = 2000¢
  assert.equal(computePayoutCents(200, 10), 2000);
});

test("floors fractional cents to whole cents", () => {
  // A fractional rate should still floor cleanly.
  // 3 credits × 6.5¢ = 19.5¢ → floor → 19¢
  assert.equal(computePayoutCents(3, 6.5), 19);
  // 1 credit × 7.9¢ = 7.9¢ → 7¢
  assert.equal(computePayoutCents(1, 7.9), 7);
});

test("non-positive / invalid inputs yield 0 (never negative)", () => {
  assert.equal(computePayoutCents(0, 7), 0);
  assert.equal(computePayoutCents(-100, 7), 0);
  assert.equal(computePayoutCents(100, 0), 0);
  assert.equal(computePayoutCents(100, -7), 0);
  assert.equal(computePayoutCents(NaN, 7), 0);
  assert.equal(computePayoutCents(Infinity, 7), 0);
  assert.equal(computePayoutCents(100, NaN), 0);
});

test("resolveCentsPerCredit prefers the creator override, then platform, then default", () => {
  assert.equal(resolveCentsPerCredit(5, 7), 5);
  assert.equal(resolveCentsPerCredit(null, 8), 8);
  assert.equal(resolveCentsPerCredit(undefined, undefined), DEFAULT_PAYOUT_CENTS_PER_CREDIT);
  // A 0 override is a real value (not "unset") and must be honored.
  assert.equal(resolveCentsPerCredit(0, 7), 0);
});

test("computeUnpaidCents subtracts what's already accounted, clamped at 0", () => {
  // Earned $10.00, $4.00 already paid/pending → $6.00 owed.
  assert.equal(computeUnpaidCents(1000, 400), 600);
  // Nothing accounted yet → all of it is owed.
  assert.equal(computeUnpaidCents(1000, 0), 1000);
  // Over-accounted (e.g. a rate was lowered) → never negative.
  assert.equal(computeUnpaidCents(500, 800), 0);
  // Non-finite inputs are treated as 0.
  assert.equal(computeUnpaidCents(NaN, 100), 0);
  assert.equal(computeUnpaidCents(500, NaN), 500);
});

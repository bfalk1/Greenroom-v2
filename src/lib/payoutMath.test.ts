import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computePayoutCents,
  resolveCentsPerCredit,
  computeUnpaidCents,
  computeProcessingFeeCents,
  computeNetPayoutCents,
  formatInvoiceNumber,
  DEFAULT_PAYOUT_CENTS_PER_CREDIT,
  DEFAULT_PAYOUT_FEE_BPS,
  DEFAULT_PAYOUT_FEE_FIXED_CENTS,
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

test("default processing fee: 2.9% + 30¢, covered by the creator", () => {
  // $50.00 gross → ceil(5000 × 290 / 10000) = 145¢ + 30¢ = 175¢ ($1.75).
  assert.equal(
    computeProcessingFeeCents(5000, DEFAULT_PAYOUT_FEE_BPS, DEFAULT_PAYOUT_FEE_FIXED_CENTS),
    175
  );
  // Net = $48.25 — the amount the admin actually sends.
  assert.equal(computeNetPayoutCents(5000, 175), 4825);
  // $100.00 gross → 290¢ + 30¢ = $3.20 fee.
  assert.equal(
    computeProcessingFeeCents(10000, DEFAULT_PAYOUT_FEE_BPS, DEFAULT_PAYOUT_FEE_FIXED_CENTS),
    320
  );
});

test("percent part of the fee rounds UP (platform never undercollects)", () => {
  // 1% of 101¢ = 1.01¢ → ceil → 2¢ (+ no fixed part).
  assert.equal(computeProcessingFeeCents(101, 100, 0), 2);
  // Exact multiples don't over-round: 1% of 100¢ = exactly 1¢.
  assert.equal(computeProcessingFeeCents(100, 100, 0), 1);
});

test("fee is clamped to gross — net can never go negative", () => {
  // 20¢ gross with a 30¢ fixed fee → fee capped at 20¢, net 0.
  assert.equal(computeProcessingFeeCents(20, 0, 30), 20);
  assert.equal(computeNetPayoutCents(20, 20), 0);
});

test("zero / invalid fee config means no fee", () => {
  assert.equal(computeProcessingFeeCents(5000, 0, 0), 0);
  assert.equal(computeProcessingFeeCents(5000, -100, -5), 0);
  assert.equal(computeProcessingFeeCents(5000, NaN, NaN), 0);
  // No gross → no fee, regardless of config.
  assert.equal(computeProcessingFeeCents(0, 290, 30), 0);
  assert.equal(computeProcessingFeeCents(-100, 290, 30), 0);
  // Net handles junk inputs too.
  assert.equal(computeNetPayoutCents(NaN, 10), 0);
  assert.equal(computeNetPayoutCents(500, NaN), 500);
});

test("invoice numbers: GR-<year>-<6-digit seq>, never truncated", () => {
  const d = new Date(Date.UTC(2026, 2, 15));
  assert.equal(formatInvoiceNumber(42, d), "GR-2026-000042");
  assert.equal(formatInvoiceNumber(BigInt(7), d), "GR-2026-000007");
  // Sequences past 999999 keep all digits.
  assert.equal(formatInvoiceNumber(1234567, d), "GR-2026-1234567");
  // Year comes from UTC so servers in any timezone agree.
  assert.equal(
    formatInvoiceNumber(1, new Date(Date.UTC(2025, 11, 31, 23, 59))),
    "GR-2025-000001"
  );
});

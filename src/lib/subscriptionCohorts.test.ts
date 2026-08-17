import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VIP_FIRST_MONTH_CENTS,
  VIP_FIRST_MONTH_SOURCE,
  VIP_LIFETIME_CENTS,
  VIP_LIFETIME_SOURCE,
  cohortOf,
  monthlyUnitCents,
} from "./subscriptionCohorts";
import { PUBLIC_SUBSCRIPTION_PACKAGES } from "./stripe/publicPriceConfig";

// These rules decide both the admin Subscribers dashboard's promo/annual counts
// and every dollar of reported MRR, off two columns that never say outright
// which offer a sub is on. A silent misclassification would move the headline
// revenue number with nothing to flag it, so pin the boundaries here.

const VIP = { name: "VIP", priceUsdCents: 1799 };
const day = (n: number) => n * 86_400_000;
const start = new Date("2026-01-01T00:00:00Z");
const plus = (ms: number) => new Date(start.getTime() + ms);

test("a plain monthly sub is the list cohort at list price", () => {
  const sub = {
    acquisitionSource: null,
    currentPeriodStart: start,
    currentPeriodEnd: plus(day(31)),
  };
  assert.equal(cohortOf(sub), "list");
  assert.equal(monthlyUnitCents("list", VIP), 1799);
});

test("a year-long period is annual, priced at the yearly charge ÷ 12", () => {
  const sub = {
    acquisitionSource: null,
    currentPeriodStart: start,
    currentPeriodEnd: plus(day(365)),
  };
  assert.equal(cohortOf(sub), "annual");
  const vipAnnual = PUBLIC_SUBSCRIPTION_PACKAGES.find(
    (p) => p.tierName === "VIP"
  )!.annualPrice;
  assert.equal(
    monthlyUnitCents("annual", VIP),
    Math.round(Math.round(vipAnnual * 100) / 12)
  );
  // The whole point of the annual rule: it must not report at monthly list.
  assert.ok(monthlyUnitCents("annual", VIP) < 1799);
});

test("month-length periods never read as annual", () => {
  for (const days of [28, 29, 30, 31, 299]) {
    assert.equal(
      cohortOf({
        acquisitionSource: null,
        currentPeriodStart: start,
        currentPeriodEnd: plus(day(days)),
      }),
      "list",
      `a ${days}-day period must not classify as annual`
    );
  }
});

test("the first-month promo is its own cohort but bills at LIST", () => {
  const sub = {
    acquisitionSource: VIP_FIRST_MONTH_SOURCE,
    currentPeriodStart: start,
    currentPeriodEnd: plus(day(30)),
  };
  assert.equal(cohortOf(sub), "promo");
  // $5.99 is a duration-"once" coupon: it moves the first invoice, not the
  // recurring rate, so MRR must stay at list.
  assert.equal(monthlyUnitCents("promo", VIP), 1799);
  assert.ok(VIP_FIRST_MONTH_CENTS < 1799);
});

test("the lifetime offer bills at its locked discount", () => {
  const sub = {
    acquisitionSource: VIP_LIFETIME_SOURCE,
    currentPeriodStart: start,
    currentPeriodEnd: plus(day(30)),
  };
  assert.equal(cohortOf(sub), "lifetime");
  assert.equal(monthlyUnitCents("lifetime", VIP), VIP_LIFETIME_CENTS);
});

test("an unknown tier prices at zero rather than throwing", () => {
  assert.equal(monthlyUnitCents("list", null), 0);
  assert.equal(monthlyUnitCents("annual", null), 0);
});

test("a tier with no configured annual price falls back to 12× monthly", () => {
  // A retired//custom tier isn't in PUBLIC_SUBSCRIPTION_PACKAGES; its annual
  // equivalent should degrade to the monthly price, not to $0.
  assert.equal(
    monthlyUnitCents("annual", { name: "LEGACY", priceUsdCents: 1200 }),
    1200
  );
});

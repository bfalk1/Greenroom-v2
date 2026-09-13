import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_VIEW_DEDUPE_MS,
  REMOUNT_DEDUPE_MS,
  resetViewDedupe,
  viewAlreadySent,
} from "./viewDedupe";

// `now` is injected in these tests; production calls pass Date.now().

test("first sighting of a key is never suppressed", () => {
  resetViewDedupe();
  assert.equal(viewAlreadySent("pricing:month", REMOUNT_DEDUPE_MS, 0), false);
});

test("a remount ~10ms later is suppressed", () => {
  resetViewDedupe();
  viewAlreadySent("checkout:VIP", REMOUNT_DEDUPE_MS, 1_000);
  assert.equal(
    viewAlreadySent("checkout:VIP", REMOUNT_DEDUPE_MS, 1_010),
    true
  );
});

test("a genuine repeat after the window still reports", () => {
  resetViewDedupe();
  viewAlreadySent("checkout:VIP", REMOUNT_DEDUPE_MS, 0);
  assert.equal(
    viewAlreadySent("checkout:VIP", REMOUNT_DEDUPE_MS, REMOUNT_DEDUPE_MS),
    false
  );
});

test("keys are independent — the billing toggle reports annual as its own view", () => {
  resetViewDedupe();
  assert.equal(
    viewAlreadySent("pricing:month", PRODUCT_VIEW_DEDUPE_MS, 0),
    false
  );
  assert.equal(
    viewAlreadySent("pricing:year", PRODUCT_VIEW_DEDUPE_MS, 100),
    false,
    "annual is a different product at a different price"
  );
});

test("toggling back to an interval already reported is suppressed", () => {
  resetViewDedupe();
  viewAlreadySent("pricing:month", PRODUCT_VIEW_DEDUPE_MS, 0);
  viewAlreadySent("pricing:year", PRODUCT_VIEW_DEDUPE_MS, 8_000);
  // month -> year -> month -> year, each flip seconds apart: the two extra
  // flips must not mint two more valued ViewContents.
  assert.equal(
    viewAlreadySent("pricing:month", PRODUCT_VIEW_DEDUPE_MS, 20_000),
    true
  );
  assert.equal(
    viewAlreadySent("pricing:year", PRODUCT_VIEW_DEDUPE_MS, 30_000),
    true
  );
});

test("the window does not slide — steady duplicates report once per window, not never", () => {
  resetViewDedupe();
  viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 0);
  // A duplicate at 4s is suppressed and must NOT push the deadline to 9s.
  assert.equal(viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 4_000), true);
  assert.equal(viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 5_000), false);
});

test("paywall keys separate by redirect_from", () => {
  resetViewDedupe();
  assert.equal(viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 0), false);
  assert.equal(
    viewAlreadySent("paywall:/library", REMOUNT_DEDUPE_MS, 10),
    false,
    "a paywall hit redirected from /library is a different event"
  );
});

test("the replaceState re-fire on /pricing?canceled=true is suppressed", () => {
  resetViewDedupe();
  // Effect run 1: query is `canceled=true`, no `redirect` param.
  assert.equal(viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 500), false);
  // history.replaceState strips the param, Next re-syncs useSearchParams,
  // the effect re-runs ~20ms later with the same redirect_from.
  assert.equal(viewAlreadySent("paywall:", REMOUNT_DEDUPE_MS, 520), true);
});

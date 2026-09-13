import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_CREDIT_PRICE,
  WHITELISTED_MAX_CREDIT_PRICE,
  maxCreditPriceFor,
  parseCreditPrice,
  parseOptionalCreditPrice,
} from "./creditPriceCaps";

describe("maxCreditPriceFor", () => {
  it("caps ordinary creators at the default ceiling", () => {
    assert.equal(maxCreditPriceFor(false), DEFAULT_MAX_CREDIT_PRICE);
    assert.equal(DEFAULT_MAX_CREDIT_PRICE, 10);
  });

  it("treats a missing flag as not whitelisted", () => {
    assert.equal(maxCreditPriceFor(undefined), DEFAULT_MAX_CREDIT_PRICE);
    assert.equal(maxCreditPriceFor(null), DEFAULT_MAX_CREDIT_PRICE);
  });

  it("lets whitelisted creators price higher", () => {
    assert.equal(maxCreditPriceFor(true), WHITELISTED_MAX_CREDIT_PRICE);
    assert.equal(maxCreditPriceFor(true), 50);
  });
});

describe("parseCreditPrice", () => {
  it("accepts numbers and numeric strings inside the range", () => {
    assert.deepEqual(parseCreditPrice(1, false), { ok: true, value: 1 });
    assert.deepEqual(parseCreditPrice("7", false), { ok: true, value: 7 });
    assert.deepEqual(parseCreditPrice(10, false), { ok: true, value: 10 });
    assert.deepEqual(parseCreditPrice("50", true), { ok: true, value: 50 });
  });

  it("rejects prices above the creator's cap", () => {
    assert.equal(parseCreditPrice(11, false).ok, false);
    assert.equal(parseCreditPrice("50", false).ok, false);
    assert.equal(parseCreditPrice(51, true).ok, false);
  });

  it("rejects zero and negative prices, which would grant credits on purchase", () => {
    assert.equal(parseCreditPrice(0, true).ok, false);
    assert.equal(parseCreditPrice(-5, true).ok, false);
    assert.equal(parseCreditPrice("-1", false).ok, false);
  });

  it("rejects fractional and non-numeric input", () => {
    assert.equal(parseCreditPrice(2.5, false).ok, false);
    assert.equal(parseCreditPrice("abc", false).ok, false);
    assert.equal(parseCreditPrice("", false).ok, false);
    assert.equal(parseCreditPrice(null, false).ok, false);
    assert.equal(parseCreditPrice(undefined, false).ok, false);
  });

  it("names the creator's own ceiling in the error", () => {
    const plain = parseCreditPrice(99, false);
    assert.equal(plain.ok, false);
    assert.match(plain.ok === false ? plain.error : "", /between 1 and 10/);

    const whitelisted = parseCreditPrice(99, true);
    assert.equal(whitelisted.ok, false);
    assert.match(
      whitelisted.ok === false ? whitelisted.error : "",
      /between 1 and 50/
    );
  });
});

describe("parseOptionalCreditPrice", () => {
  it("falls back to the 1-credit column default when unspecified", () => {
    assert.deepEqual(parseOptionalCreditPrice(undefined, false), { ok: true, value: 1 });
    assert.deepEqual(parseOptionalCreditPrice(null, false), { ok: true, value: 1 });
    assert.deepEqual(parseOptionalCreditPrice("", false), { ok: true, value: 1 });
  });

  it("still validates anything actually supplied", () => {
    assert.deepEqual(parseOptionalCreditPrice("3", false), { ok: true, value: 3 });
    assert.equal(parseOptionalCreditPrice("11", false).ok, false);
    assert.equal(parseOptionalCreditPrice("0", false).ok, false);
    assert.equal(parseOptionalCreditPrice("-2", false).ok, false);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, COUNTRY_ENTRIES, countryToIso2 } from "./countries";

describe("countryToIso2", () => {
  it("resolves canonical display names (any case)", () => {
    assert.equal(countryToIso2("United States"), "us");
    assert.equal(countryToIso2("germany"), "de");
    assert.equal(countryToIso2("UNITED KINGDOM"), "gb");
    assert.equal(countryToIso2("Congo (DRC)"), "cd");
    assert.equal(countryToIso2("South Korea"), "kr");
  });

  it("passes through ISO alpha-2 codes as Stripe sends them", () => {
    assert.equal(countryToIso2("us"), "us");
    assert.equal(countryToIso2("US"), "us");
    assert.equal(countryToIso2(" DE "), "de");
  });

  it("resolves the legacy free-text aliases", () => {
    assert.equal(countryToIso2("USA"), "us");
    assert.equal(countryToIso2("United States of America"), "us");
    assert.equal(countryToIso2("UK"), "gb");
    assert.equal(countryToIso2("England"), "gb");
    assert.equal(countryToIso2("Czech Republic"), "cz");
    assert.equal(countryToIso2("Türkiye"), "tr");
  });

  it("returns undefined for anything it can't resolve confidently", () => {
    assert.equal(countryToIso2("Atlantis"), undefined);
    assert.equal(countryToIso2("zz"), undefined);
    assert.equal(countryToIso2(""), undefined);
    assert.equal(countryToIso2("   "), undefined);
    assert.equal(countryToIso2(null), undefined);
    assert.equal(countryToIso2(undefined), undefined);
  });

  it("resolves every canonical entry to its own code", () => {
    for (const [name, code] of COUNTRY_ENTRIES) {
      assert.equal(countryToIso2(name), code, `${name} should resolve`);
    }
  });
});

describe("COUNTRY_ENTRIES integrity", () => {
  it("codes are lowercase alpha-2 and unique; names unique; COUNTRIES mirrors names", () => {
    const names = new Set<string>();
    const codes = new Set<string>();
    for (const [name, code] of COUNTRY_ENTRIES) {
      assert.match(code, /^[a-z]{2}$/, `${name}: bad code "${code}"`);
      assert.ok(!names.has(name), `duplicate name ${name}`);
      assert.ok(!codes.has(code), `duplicate code ${code} (${name})`);
      names.add(name);
      codes.add(code);
    }
    assert.deepEqual(
      COUNTRIES,
      COUNTRY_ENTRIES.map(([name]) => name)
    );
  });
});

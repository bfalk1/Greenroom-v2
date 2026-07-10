import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canadaTaxPercent,
  resolveCanadaTax,
  pstRegisteredProvinces,
  taxCollectionEnabled,
  CA_PROVINCES,
} from "./canadaRates";

// Registration sets used across the cases below. `NONE` = GST/HST only (no
// separate provincial tax registered anywhere). `ALL_PST` = registered for the
// separate PST/RST/QST in every province that has one.
const NONE = new Set<string>();
const ALL_PST = new Set(["BC", "SK", "MB", "QC"]);

// Expected COMBINED rates when NOT registered for any separate provincial tax —
// i.e. GST/HST only. Cross-checked against CRA rates current 2026-07:
// GST 5% everywhere; HST provinces ON 13, NS 14 (dropped from 15 in Apr 2025),
// NB/NL/PE 15. Territories are GST-only (5%).
const GST_HST_ONLY: Record<string, number> = {
  AB: 5, BC: 5, MB: 5, SK: 5, QC: 5, NT: 5, NU: 5, YT: 5,
  ON: 13,
  NS: 14,
  NB: 15, NL: 15, PE: 15,
};

// Expected COMBINED rates once registered for the separate provincial tax.
// Only the four PST/RST/QST provinces change; the HST provinces + territories
// are unaffected. Cross-checked vs CRA: BC 5+7, SK 5+6, MB 5+7, QC 5+9.975.
const WITH_PST: Record<string, number> = {
  ...GST_HST_ONLY,
  BC: 12,
  SK: 11,
  MB: 12,
  QC: 14.975,
};

test("GST/HST-only rates match CRA for every province (no PST registered)", () => {
  for (const [prov, expected] of Object.entries(GST_HST_ONLY)) {
    assert.equal(
      canadaTaxPercent("CA", prov, NONE),
      expected,
      `${prov} GST/HST-only should be ${expected}%`
    );
  }
});

test("registered provincial tax stacks on top of GST (BC 12, SK 11, MB 12, QC 14.975)", () => {
  for (const [prov, expected] of Object.entries(WITH_PST)) {
    assert.equal(
      canadaTaxPercent("CA", prov, ALL_PST),
      expected,
      `${prov} with PST registered should be ${expected}%`
    );
  }
});

test("PST addon only applies where actually registered", () => {
  // Registered in BC only: BC picks up its 7% PST, but SK/MB/QC stay GST-only.
  const bcOnly = new Set(["BC"]);
  assert.equal(canadaTaxPercent("CA", "BC", bcOnly), 12); // 5 + 7
  assert.equal(canadaTaxPercent("CA", "SK", bcOnly), 5); // not registered → GST only
  assert.equal(canadaTaxPercent("CA", "MB", bcOnly), 5);
  assert.equal(canadaTaxPercent("CA", "QC", bcOnly), 5);
});

test("QC combined rate is exactly 14.975 with no float noise", () => {
  // The function rounds to 3dp so 5 + 9.975 can't pick up binary-float dust —
  // this is also the string PayPal receives as `taxes.percentage`.
  const qc = canadaTaxPercent("CA", "QC", ALL_PST);
  assert.equal(qc, 14.975);
  assert.equal(String(qc), "14.975"); // clean serialization for PayPal
});

test("non-Canada is a zero-rated export (0%)", () => {
  for (const country of ["US", "GB", "us", "FR", "AU", " US "]) {
    assert.equal(canadaTaxPercent(country, "CA", ALL_PST), 0, `${country} → 0%`);
  }
  // Region is irrelevant for a non-CA country.
  assert.equal(canadaTaxPercent("US", "ON", ALL_PST), 0);
});

test("null / undefined / blank country → 0% (no tax)", () => {
  assert.equal(canadaTaxPercent(null, "ON", ALL_PST), 0);
  assert.equal(canadaTaxPercent(undefined, "ON", ALL_PST), 0);
  assert.equal(canadaTaxPercent("", "ON", ALL_PST), 0);
  assert.equal(canadaTaxPercent("   ", "ON", ALL_PST), 0);
});

test("unknown / blank CA province falls back to 5% GST floor", () => {
  assert.equal(canadaTaxPercent("CA", "ZZ", ALL_PST), 5); // bogus code
  assert.equal(canadaTaxPercent("CA", "", ALL_PST), 5); // blank
  assert.equal(canadaTaxPercent("CA", null, ALL_PST), 5);
  assert.equal(canadaTaxPercent("CA", undefined, ALL_PST), 5);
});

test("country and region are case- and whitespace-insensitive", () => {
  assert.equal(canadaTaxPercent("ca", "on", ALL_PST), 13);
  assert.equal(canadaTaxPercent(" Ca ", " On ", ALL_PST), 13);
  assert.equal(canadaTaxPercent("CA", "qc", ALL_PST), 14.975);
});

test("every province in CA_PROVINCES resolves to a real (non-zero) CA rate", () => {
  // Guards against a province being listed in the UI dropdown but missing from
  // the rate table (which would silently fall to the 5% floor).
  for (const p of CA_PROVINCES) {
    const rate = canadaTaxPercent("CA", p.code, NONE);
    assert.ok(rate >= 5, `${p.code} should be at least the 5% GST floor`);
    assert.ok(GST_HST_ONLY[p.code] !== undefined, `${p.code} missing from expected table`);
  }
  assert.equal(CA_PROVINCES.length, 13, "Canada has 10 provinces + 3 territories");
});

test("EXCLUSIVE model: tax is added on top of the advertised price", () => {
  // Mirrors the checkout page math: total = price + price * rate/100.
  // Runbook example: ON subscriber at $9.99 → $11.29.
  const price = 9.99;
  const rate = canadaTaxPercent("CA", "ON", NONE); // 13
  const total = price + (price * rate) / 100;
  assert.equal(total.toFixed(2), "11.29");

  // A US buyer at the same price pays exactly the sticker price (0% tax).
  const usTotal = 9.99 + (9.99 * canadaTaxPercent("US", null, NONE)) / 100;
  assert.equal(usTotal.toFixed(2), "9.99");
});

test("pstRegisteredProvinces parses NEXT_PUBLIC_TAX_PST_PROVINCES", () => {
  const prev = process.env.NEXT_PUBLIC_TAX_PST_PROVINCES;
  try {
    process.env.NEXT_PUBLIC_TAX_PST_PROVINCES = " bc , qc ,, ";
    const set = pstRegisteredProvinces();
    assert.deepEqual([...set].sort(), ["BC", "QC"]); // trimmed, upper, blanks dropped

    process.env.NEXT_PUBLIC_TAX_PST_PROVINCES = "";
    assert.equal(pstRegisteredProvinces().size, 0); // empty = GST/HST only

    delete process.env.NEXT_PUBLIC_TAX_PST_PROVINCES;
    assert.equal(pstRegisteredProvinces().size, 0); // unset = empty
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_TAX_PST_PROVINCES;
    else process.env.NEXT_PUBLIC_TAX_PST_PROVINCES = prev;
  }
});

test("taxCollectionEnabled is the master flag and defaults OFF (inert)", () => {
  const prev = process.env.NEXT_PUBLIC_TAX_ENABLED;
  try {
    delete process.env.NEXT_PUBLIC_TAX_ENABLED;
    assert.equal(taxCollectionEnabled(), false); // unset → off (ships inert)

    process.env.NEXT_PUBLIC_TAX_ENABLED = "false";
    assert.equal(taxCollectionEnabled(), false);

    process.env.NEXT_PUBLIC_TAX_ENABLED = "1"; // only the literal "true" counts
    assert.equal(taxCollectionEnabled(), false);

    process.env.NEXT_PUBLIC_TAX_ENABLED = "true";
    assert.equal(taxCollectionEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_TAX_ENABLED;
    else process.env.NEXT_PUBLIC_TAX_ENABLED = prev;
  }
});

// ——— resolveCanadaTax: two-indicator (declared + IP) resolution ———

const ip = (
  declaredCountry: string | null,
  declaredRegion: string | null,
  ipCountry: string | null,
  ipRegion: string | null,
  reg: Set<string> = NONE
) => resolveCanadaTax({ declaredCountry, declaredRegion, ipCountry, ipRegion }, reg);

test("both indicators Canadian and agreeing → that province's rate", () => {
  const r = ip("CA", "ON", "CA", "ON");
  assert.equal(r.percent, 13);
  assert.equal(r.country, "CA");
  assert.equal(r.region, "ON");
  assert.equal(r.basis, "both-indicators-ca");
  assert.equal(r.conflict, false);
});

test("both Canadian but province differs → billing province wins over IP", () => {
  // Declared ON, IP says BC — bill-to address is the more reliable province signal.
  const r = ip("CA", "ON", "CA", "BC");
  assert.equal(r.region, "ON");
  assert.equal(r.percent, 13);
  assert.equal(r.conflict, false);
});

test("declared Canada, IP foreign → charge Canadian (declared is an opt-in)", () => {
  const r = ip("CA", "ON", "US", "NY");
  assert.equal(r.percent, 13);
  assert.equal(r.basis, "declared-ca-ip-foreign");
  assert.equal(r.conflict, true); // CA vs non-CA disagreement
});

test("EVASION: declares US but IP says Canada → charged Canadian tax from IP province", () => {
  const r = ip("US", "", "CA", "ON");
  assert.equal(r.percent, 13); // Ontario HST, not 0%
  assert.equal(r.country, "CA");
  assert.equal(r.region, "ON");
  assert.equal(r.basis, "ip-ca-declared-foreign");
  assert.equal(r.conflict, true);
});

test("EVASION with a registered PST province: declares US, IP says BC → 12%", () => {
  const r = ip("US", "", "CA", "BC", ALL_PST);
  assert.equal(r.percent, 12); // 5 GST + 7 BC PST
  assert.equal(r.region, "BC");
});

test("both indicators foreign → zero-rated export (0%)", () => {
  const r = ip("US", "NY", "US", "CA"); // note: IP region 'CA' = California, NOT Canada
  assert.equal(r.percent, 0);
  assert.equal(r.basis, "both-indicators-foreign");
  assert.equal(r.conflict, false);
});

test("US IP region 'CA' (California) is not mistaken for Canada", () => {
  // Guard against confusing the region code 'CA' with the country 'CA' — we only
  // treat IP as Canadian when the IP COUNTRY is CA.
  const r = ip("US", "", "US", "CA");
  assert.equal(r.percent, 0);
  assert.equal(r.country, "US");
});

test("IP unknown (local dev / no edge headers) → falls back to declared indicator", () => {
  const caOnly = ip("CA", "ON", null, null);
  assert.equal(caOnly.percent, 13);
  assert.equal(caOnly.basis, "declared-ca-ip-unknown");
  assert.equal(caOnly.conflict, false); // unknown IP is not a conflict

  const usOnly = ip("US", "", "", "");
  assert.equal(usOnly.percent, 0);
  assert.equal(usOnly.basis, "declared-foreign-ip-unknown");
});

test("resolveCanadaTax always reports the raw indicators for the audit record", () => {
  const r = ip("us", "", "ca", "on");
  assert.deepEqual(r.indicators, {
    declaredCountry: "US",
    declaredRegion: "",
    ipCountry: "CA",
    ipRegion: "ON",
  });
});

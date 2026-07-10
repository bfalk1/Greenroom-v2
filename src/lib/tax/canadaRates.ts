// Canadian sales-tax rates for digital goods (loops, presets, credits).
//
// This exists because PayPal Billing can't compute location-based tax the way
// Stripe Tax does — so for the PayPal checkout path we look the rate up here and
// pass it to PayPal as tax-on-top (EXCLUSIVE). Stripe still computes its own
// rates natively; keep the two consistent by mirroring NEXT_PUBLIC_TAX_PST_PROVINCES
// to your actual Stripe tax registrations.
//
// GST/HST is federally administered and applies in every province once you're
// GST/HST-registered. The separate provincial taxes (BC PST, SK PST, MB RST,
// QC QST) each have their own registration + threshold and only apply where you
// have registered — gated by NEXT_PUBLIC_TAX_PST_PROVINCES so we don't charge
// them before we're on the hook to remit them.
//
// Rates current as of 2026-07 (NS HST dropped 15% -> 14% in April 2025). These
// change; this table is the single place to update them. NOT tax advice.

export interface CaProvince {
  code: string;
  name: string;
}

export const CA_PROVINCES: readonly CaProvince[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;

// Federal GST (5%) or blended HST by province.
const GST_HST_PERCENT: Record<string, number> = {
  AB: 5, BC: 5, MB: 5, SK: 5, QC: 5, NT: 5, NU: 5, YT: 5,
  ON: 13,
  NS: 14,
  NB: 15, NL: 15, PE: 15,
};

// Separate provincial tax (PST / RST / QST), added only where registered.
const PROVINCIAL_ADDON_PERCENT: Record<string, number> = {
  BC: 7,
  SK: 6,
  MB: 7,
  QC: 9.975,
};

/**
 * Provinces where we're registered for the separate provincial tax, from
 * NEXT_PUBLIC_TAX_PST_PROVINCES (e.g. "BC,QC"). Public so the client order
 * summary previews the same total the server charges. Empty = GST/HST only.
 */
export function pstRegisteredProvinces(): Set<string> {
  return new Set(
    (process.env.NEXT_PUBLIC_TAX_PST_PROVINCES ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
}

/**
 * Combined sales-tax percentage for a buyer's location, as a number like
 * 13 or 12 or 9.975 (percent, NOT a fraction). Non-Canada is a zero-rated
 * export (0%). A Canadian address with an unknown/blank province falls back to
 * federal GST (5%) — a safe floor; our checkout UI requires a province for CA
 * so this only guards against bad input.
 */
export function canadaTaxPercent(
  country: string | null | undefined,
  region: string | null | undefined,
  registered: Set<string> = pstRegisteredProvinces()
): number {
  if ((country ?? "").trim().toUpperCase() !== "CA") return 0;

  const prov = (region ?? "").trim().toUpperCase();
  const base = GST_HST_PERCENT[prov] ?? 5;
  const addon = registered.has(prov) ? PROVINCIAL_ADDON_PERCENT[prov] ?? 0 : 0;

  // Round to 3 dp so QC's 9.975 + 5 = 14.975 doesn't pick up float noise;
  // this is also the string PayPal receives as `taxes.percentage`.
  return Math.round((base + addon) * 1000) / 1000;
}

function normLoc(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

export interface TaxLocationInputs {
  /** Country the buyer selected on our checkout page (self-declared). */
  declaredCountry: string | null | undefined;
  /** Province the buyer selected (self-declared). */
  declaredRegion: string | null | undefined;
  /** IP-geolocated country from Vercel's `x-vercel-ip-country` edge header. */
  ipCountry: string | null | undefined;
  /** IP-geolocated region from Vercel's `x-vercel-ip-country-region` header. */
  ipRegion: string | null | undefined;
}

export interface TaxResolution {
  /** Combined rate to charge, as a percent (e.g. 13). */
  percent: number;
  /** Country the rate was computed for after resolving the two indicators. */
  country: string;
  /** Region the rate was computed for. */
  region: string;
  /** Why this decision was reached — retained as audit evidence. */
  basis: string;
  /** True when the declared country and the IP country disagreed on CA-vs-not. */
  conflict: boolean;
  /** The raw indicators relied on, for the per-transaction audit record. */
  indicators: {
    declaredCountry: string;
    declaredRegion: string;
    ipCountry: string;
    ipRegion: string;
  };
}

/**
 * Resolve the tax rate from TWO location indicators — the buyer's self-declared
 * country/region AND their IP-geolocated country/region — instead of trusting a
 * single self-declared field. This mirrors the CRA cross-border digital-economy
 * rule (two or more non-contradicting indicators obtained in the ordinary course
 * of operations) and, importantly, closes the evasion gap: a buyer who picks a
 * tax-free country on our form but connects from Canada still pays Canadian tax,
 * because the IP indicator (which they can't set from the form) contradicts the
 * declaration and we resolve the conflict toward Canada (the safer side to remit).
 *
 * The IP inputs come from Vercel's edge headers, which are absent in local dev —
 * when the IP country is unknown we fall back to the declared indicator alone.
 * The returned `indicators`/`basis` are meant to be logged/retained per charge as
 * the audit evidence the CRA test is graded against.
 */
export function resolveCanadaTax(
  inputs: TaxLocationInputs,
  registered: Set<string> = pstRegisteredProvinces()
): TaxResolution {
  const declaredCountry = normLoc(inputs.declaredCountry);
  const declaredRegion = normLoc(inputs.declaredRegion);
  const ipCountry = normLoc(inputs.ipCountry);
  const ipRegion = normLoc(inputs.ipRegion);

  const declaredCA = declaredCountry === "CA";
  const ipCA = ipCountry === "CA";
  const ipKnown = ipCountry !== "";

  let country: string;
  let region: string;
  let basis: string;

  if (declaredCA && ipCA) {
    // Both indicators Canadian — strongest signal. Prefer the declared province
    // (billing address is more reliable than IP for province); IP fills a blank.
    country = "CA";
    region = declaredRegion || ipRegion;
    basis = "both-indicators-ca";
  } else if (declaredCA) {
    // Declared Canada — a Canadian indicator and an explicit opt-in to tax.
    country = "CA";
    region = declaredRegion;
    basis = ipKnown ? "declared-ca-ip-foreign" : "declared-ca-ip-unknown";
  } else if (ipCA) {
    // Declared non-Canada but the IP says Canada — the evasion-suspect case.
    // Resolve toward Canada and tax from the IP's province: over-collecting and
    // remitting is the safe side, and it removes any incentive to mis-declare.
    country = "CA";
    region = ipRegion;
    basis = "ip-ca-declared-foreign";
  } else {
    // No Canadian indicator → zero-rated export (0%).
    country = declaredCountry || ipCountry || "";
    region = "";
    basis = ipKnown ? "both-indicators-foreign" : "declared-foreign-ip-unknown";
  }

  return {
    percent: canadaTaxPercent(country, region, registered),
    country,
    region,
    basis,
    conflict: ipKnown && declaredCA !== ipCA,
    indicators: { declaredCountry, declaredRegion, ipCountry, ipRegion },
  };
}

/** Master on/off for tax collection — both providers read this one flag. */
export function taxCollectionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TAX_ENABLED === "true";
}

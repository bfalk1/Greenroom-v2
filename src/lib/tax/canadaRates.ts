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

/** Master on/off for tax collection — both providers read this one flag. */
export function taxCollectionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TAX_ENABLED === "true";
}

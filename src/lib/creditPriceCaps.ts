// Credit-price caps for marketplace listings (samples and presets).
//
// `creditPrice` is what a buyer is charged in POST /api/purchases, so it is
// bounded at both ends. The upper bound is per-creator: whitelisted creators
// (User.isWhitelisted, toggled by admins) may price above the default ceiling.
// The lower bound matters just as much — the purchase route subtracts the
// price from the buyer's balance, so a zero or negative price would hand out
// a free or credit-granting item.
//
// Every route that accepts a creditPrice from a creator validates through
// these helpers, so the caps cannot drift apart the way they did when each
// route inlined its own `isWhitelisted ? 50 : 5`. Client inputs clamp with
// maxCreditPriceFor for the same reason; that clamp is a convenience, the
// server check is the enforcement.
//
// Moderator/admin edit routes (/api/mod/samples, /api/mod/samples/bulk) are
// deliberately uncapped — staff repricing is an override.

export const MIN_CREDIT_PRICE = 1;
export const DEFAULT_MAX_CREDIT_PRICE = 10;
export const WHITELISTED_MAX_CREDIT_PRICE = 50;

/** The highest price this creator may set on a sample or preset. */
export function maxCreditPriceFor(
  isWhitelisted: boolean | null | undefined
): number {
  return isWhitelisted ? WHITELISTED_MAX_CREDIT_PRICE : DEFAULT_MAX_CREDIT_PRICE;
}

export type CreditPriceResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validate a creator-supplied credit price. Accepts the numbers and numeric
 * strings that arrive from JSON bodies and multipart form data alike, and
 * rejects anything that is not a whole number within the creator's range.
 */
export function parseCreditPrice(
  input: unknown,
  isWhitelisted: boolean | null | undefined
): CreditPriceResult {
  const max = maxCreditPriceFor(isWhitelisted);
  const value =
    typeof input === "number" ? input : parseInt(String(input), 10);

  if (!Number.isInteger(value) || value < MIN_CREDIT_PRICE || value > max) {
    return {
      ok: false,
      error: `Credit price must be a whole number between ${MIN_CREDIT_PRICE} and ${max}`,
    };
  }

  return { ok: true, value };
}

/**
 * Create-route variant: an absent or empty price means "not specified" and
 * falls back to 1, matching the `@default(1)` on both columns. Anything the
 * creator actually supplied is validated strictly.
 */
export function parseOptionalCreditPrice(
  input: unknown,
  isWhitelisted: boolean | null | undefined
): CreditPriceResult {
  if (input === undefined || input === null || input === "") {
    return { ok: true, value: MIN_CREDIT_PRICE };
  }
  return parseCreditPrice(input, isWhitelisted);
}

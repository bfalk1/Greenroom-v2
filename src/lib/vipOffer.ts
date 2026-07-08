import { createHmac, timingSafeEqual } from "crypto";

// Shared constants/helpers for the returning-subscriber VIP lifetime offer.
//
// The /api/vip-offer route sets the unlock cookie after a password match; the
// subscription checkout route reads the SAME cookie to authorize the lifetime
// VIP coupon. Keeping the cookie name + password + coupon id in one place stops
// the soft marketing gate and the real server-side enforcement from silently
// drifting apart (a mismatch would either hand out the discount for free or
// never apply it at all).
//
// SERVER ONLY — imports node:crypto. Imported solely by the two API routes
// above; never pull this into a client component.

export const VIP_OFFER_COOKIE = "gr_vip_offer";
export const VIP_OFFER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Shared password handed to past subscribers. Overridable via env so it can be
// rotated without a deploy. Falls back to the launch password.
export function vipOfferPassword(): string {
  return process.env.VIP_OFFER_PASSWORD ?? "GRVIP";
}

// Stripe coupon applied at checkout for the lifetime VIP discount. Must be
// created in the Stripe Dashboard as $6.00 off (amount_off = 600, currency usd)
// with duration = "forever", then its id set here. Empty string means the
// discount is not configured — checkout treats a lifetime request as ineligible
// rather than silently charging full price.
export function vipLifetimeCouponId(): string {
  return process.env.STRIPE_VIP_LIFETIME_COUPON_ID ?? "";
}

// Secret that signs the unlock cookie. Prefer a dedicated value (stable across
// deploys); otherwise reuse the Stripe secret, which is always set in prod and
// never reaches the client. The dev fallback only matters locally.
function unlockSecret(): string {
  return (
    process.env.VIP_OFFER_SECRET ??
    process.env.STRIPE_SECRET_KEY ??
    "gr-vip-offer-dev-secret"
  );
}

// The unlock cookie stores this HMAC token — NOT a guessable constant like "1".
// That matters because the cookie is the server-side gate on a real discount: a
// plain value could be forged by anyone hand-setting `gr_vip_offer=1` in a
// request, skipping the password entirely. Forging this token requires the
// server secret, so the GRVIP password is actually required to unlock the offer.
export function signVipUnlock(): string {
  return createHmac("sha256", unlockSecret())
    .update("vip-offer-unlocked")
    .digest("hex");
}

export function verifyVipUnlock(value: string | undefined | null): boolean {
  if (!value) return false;
  const expected = signVipUnlock();
  if (value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

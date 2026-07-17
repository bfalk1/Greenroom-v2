import { randomBytes } from "crypto";

/**
 * Pure referral-code helpers — no DB access, so they can be unit-tested
 * directly (same split as payoutMath.ts vs payouts.ts). DB lookups and reward
 * granting live in src/lib/referral.ts.
 */

// Two reward tracks, chosen by the REFERRER's role at redemption time:
//
//   USER / MOD / ADMIN referrer  → 100 credits to the referrer AND 100 credits
//                                  to the referred user.
//   CREATOR referrer             → flat $10 payout cash to the creator, and the
//                                  referred user gets the VIP lifetime discount
//                                  (an account unlock, not credits).

/** Credits granted to the referred user when the referrer is NOT a creator. */
export const REFERRED_SIGNUP_CREDITS = 100;

/** Credits granted to a USER (non-creator) referrer per referred signup. */
export const REFERRER_REWARD_CREDITS = 100;

/**
 * Flat payout cash granted to a CREATOR referrer per referred signup, in USD
 * cents ($10.00). Deliberately NOT rate-scaled — every creator earns the same
 * $10 for a referral regardless of their per-credit payout rate.
 */
export const CREATOR_REFERRER_REWARD_CENTS = 1000;

/**
 * Soft anti-abuse cap: after this many rewarded referrals in a calendar month
 * the referrer's own reward is withheld (recorded on the referral row with a
 * skip reason). Applied when the reward is granted (VIP activation), not at
 * signup.
 */
export const MAX_REWARDED_REFERRALS_PER_MONTH = 25;

/**
 * Rewards are earned only when the referred user activates a VIP subscription,
 * and only if they do so within this many days of signing up. After the window
 * the pending referral expires unrewarded.
 */
export const REFERRAL_REWARD_WINDOW_DAYS = 30;

export const REFERRAL_CODE_LENGTH = 8;

// Uppercase alphanumerics minus the confusable I/L/O/0/1 — codes get read
// aloud and retyped, so every character must be unambiguous.
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a random referral code (collision handling is the caller's job). */
export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Normalize untrusted referral-code input (query param / user_metadata) for
 * lookup: trim, uppercase, and bound to the expected shape. Returns null for
 * anything that can't be a real code, so callers can treat "no code" and
 * "garbage code" identically.
 */
export function normalizeReferralCode(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return null;
  return /^[A-Z0-9]+$/.test(code) ? code : null;
}

/** The shareable signup link for a code, given the site origin. */
export function buildReferralUrl(origin: string, code: string): string {
  return `${origin}/signup?ref=${encodeURIComponent(code)}`;
}

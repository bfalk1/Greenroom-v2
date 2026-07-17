import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateReferralCode,
  normalizeReferralCode,
  buildReferralUrl,
  REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_ALPHABET,
  REFERRED_SIGNUP_CREDITS,
  REFERRER_REWARD_CREDITS,
  CREATOR_REFERRER_REWARD_CENTS,
  REFERRAL_REWARD_WINDOW_DAYS,
} from "./referralCode";

test("reward constants match the launch offer", () => {
  // User→user: 100 credits to the referred user AND 100 to the referrer, paid
  // when the referred user activates a VIP subscription within the window.
  // Creator→user: the referred user gets the VIP discount at signup (no
  // credits), and the creator earns a flat $10 (1000¢) payout cash on that VIP
  // activation. Guard the amounts + window so a refactor can't silently change
  // what marketing promised.
  assert.equal(REFERRED_SIGNUP_CREDITS, 100);
  assert.equal(REFERRER_REWARD_CREDITS, 100);
  assert.equal(CREATOR_REFERRER_REWARD_CENTS, 1000);
  assert.equal(REFERRAL_REWARD_WINDOW_DAYS, 30);
});

test("generated codes have the expected length and alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateReferralCode();
    assert.equal(code.length, REFERRAL_CODE_LENGTH);
    for (const ch of code) {
      assert.ok(
        REFERRAL_CODE_ALPHABET.includes(ch),
        `unexpected character ${ch} in ${code}`
      );
    }
  }
});

test("alphabet excludes the confusable I/L/O/0/1", () => {
  for (const ch of "ILO01") {
    assert.ok(!REFERRAL_CODE_ALPHABET.includes(ch));
  }
});

test("generated codes survive their own normalization", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateReferralCode();
    assert.equal(normalizeReferralCode(code), code);
  }
});

test("normalization trims and uppercases", () => {
  assert.equal(normalizeReferralCode("  abcd2345 "), "ABCD2345");
  assert.equal(normalizeReferralCode("AbCd2345"), "ABCD2345");
});

test("normalization rejects garbage input", () => {
  assert.equal(normalizeReferralCode(null), null);
  assert.equal(normalizeReferralCode(undefined), null);
  assert.equal(normalizeReferralCode(""), null);
  assert.equal(normalizeReferralCode("short"), null);
  assert.equal(normalizeReferralCode("waytoolongforacode"), null);
  assert.equal(normalizeReferralCode("ABCD-234"), null); // punctuation
  assert.equal(normalizeReferralCode("ABCD 234"), null); // inner whitespace
  // SQL-ish / injection-ish inputs never reach the DB as-is
  assert.equal(normalizeReferralCode("' OR 1=1"), null);
});

test("referral URL points at signup with the encoded code", () => {
  assert.equal(
    buildReferralUrl("https://greenroom.app", "ABCD2345"),
    "https://greenroom.app/signup?ref=ABCD2345"
  );
});

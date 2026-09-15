import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL,
  createUnsubscribeToken,
  maskEmail,
  readUnsubscribeToken,
  resolveUnsubscribeLink,
} from "./unsubscribeToken";

// The module reads its secrets from the environment on every call, so each
// test starts from a known one. NODE_ENV is typed read-only, hence the alias.
const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = ["UNSUBSCRIBE_TOKEN_SECRET", "STRIPE_SECRET_KEY", "NODE_ENV"];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));
  env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret-a";
  delete env.STRIPE_SECRET_KEY;
  // Production, so the dev-only fallback key stays out unless a test opts in.
  env.NODE_ENV = "production";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete env[key];
    else env[key] = savedEnv[key];
  }
});

const ADDRESS = "fan.of.greenroom@example.com";

function flipBit(token: string, byteIndex: number): string {
  const bytes = Buffer.from(token, "base64url");
  bytes[byteIndex] ^= 0x01;
  return bytes.toString("base64url");
}

describe("createUnsubscribeToken / readUnsubscribeToken", () => {
  it("round-trips the recipient address", () => {
    assert.equal(readUnsubscribeToken(createUnsubscribeToken(ADDRESS)), ADDRESS);
  });

  it("seals the normalized address", () => {
    const token = createUnsubscribeToken("  Fan.Of.Greenroom@Example.COM ");
    assert.equal(readUnsubscribeToken(token), ADDRESS);
  });

  it("is URL-safe and never carries the address, encoded or not", () => {
    const token = createUnsubscribeToken(ADDRESS);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(token.includes(ADDRESS), false);
    assert.equal(token.includes(encodeURIComponent(ADDRESS)), false);
    // Encrypted, not merely encoded: the decoded bytes don't contain it either.
    assert.equal(Buffer.from(token, "base64url").includes(Buffer.from(ADDRESS)), false);
  });

  it("mints a fresh token on every call, each one valid", () => {
    const first = createUnsubscribeToken(ADDRESS);
    const second = createUnsubscribeToken(ADDRESS);
    assert.notEqual(first, second);
    assert.equal(readUnsubscribeToken(first), ADDRESS);
    assert.equal(readUnsubscribeToken(second), ADDRESS);
  });

  it("rejects a token with any bit of any byte flipped", () => {
    const token = createUnsubscribeToken(ADDRESS);
    const length = Buffer.from(token, "base64url").length;
    for (let i = 0; i < length; i++) {
      assert.equal(readUnsubscribeToken(flipBit(token, i)), null, `byte ${i}`);
    }
  });

  it("rejects truncated and extended tokens", () => {
    const token = createUnsubscribeToken(ADDRESS);
    for (const bad of [token.slice(0, -1), token.slice(0, -4), `${token}A`, `${token}AAAA`, `${token}=`]) {
      assert.equal(readUnsubscribeToken(bad), null, bad);
    }
  });

  it("rejects a second spelling that decodes to the same bytes", () => {
    const token = createUnsubscribeToken(ADDRESS);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.indexOf(token[token.length - 1]);
    const variant = token.slice(0, -1) + alphabet[last ^ 1];
    // Guard: the flipped bit must be a spare one, or this test proves nothing.
    assert.deepEqual(Buffer.from(variant, "base64url"), Buffer.from(token, "base64url"));
    assert.equal(readUnsubscribeToken(variant), null);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "not a token", "!!!!", "A", "AAAA", "a+b/c=", "A".repeat(5000)]) {
      assert.equal(readUnsubscribeToken(bad), null, bad.slice(0, 20));
    }
  });

  it("rejects a token sealed under another secret", () => {
    const token = createUnsubscribeToken(ADDRESS);
    env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret-b";
    assert.equal(readUnsubscribeToken(token), null);
  });

  it("keeps opening STRIPE_SECRET_KEY-fallback tokens after the dedicated secret is set", () => {
    delete env.UNSUBSCRIBE_TOKEN_SECRET;
    env.STRIPE_SECRET_KEY = "sk_test_fallback";
    const fallbackToken = createUnsubscribeToken(ADDRESS);

    env.UNSUBSCRIBE_TOKEN_SECRET = "test-unsubscribe-secret-a";
    assert.equal(readUnsubscribeToken(fallbackToken), ADDRESS);

    // New tokens are sealed with the dedicated secret, not the fallback.
    const dedicatedToken = createUnsubscribeToken(ADDRESS);
    delete env.UNSUBSCRIBE_TOKEN_SECRET;
    assert.equal(readUnsubscribeToken(dedicatedToken), null);
  });

  it("stops opening a token at its expiry", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 60_000);
    const token = createUnsubscribeToken(ADDRESS, { expiresAt });
    assert.equal(readUnsubscribeToken(token, now), ADDRESS);
    assert.equal(readUnsubscribeToken(token, expiresAt), null);
  });

  it("throws in production with no secret instead of minting forgeable tokens", () => {
    delete env.UNSUBSCRIBE_TOKEN_SECRET;
    assert.throws(() => createUnsubscribeToken(ADDRESS), /UNSUBSCRIBE_TOKEN_SECRET/);
    assert.equal(readUnsubscribeToken("AQ" + "A".repeat(60)), null);
  });

  it("uses a dev-only key outside production, which production refuses", () => {
    delete env.UNSUBSCRIBE_TOKEN_SECRET;
    env.NODE_ENV = "development";
    const devToken = createUnsubscribeToken(ADDRESS);
    assert.equal(readUnsubscribeToken(devToken), ADDRESS);

    env.NODE_ENV = "production";
    env.STRIPE_SECRET_KEY = "sk_live_example";
    assert.equal(readUnsubscribeToken(devToken), null);
  });
});

describe("resolveUnsubscribeLink", () => {
  const beforeCutoff = new Date(LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL.getTime() - 1000);

  it("resolves a token to its address and keeps the token", () => {
    const token = createUnsubscribeToken(ADDRESS);
    assert.deepEqual(resolveUnsubscribeLink({ token }), { ok: true, email: ADDRESS, token });
  });

  it("lets a token win over an address sent alongside it", () => {
    const token = createUnsubscribeToken(ADDRESS);
    const link = resolveUnsubscribeLink({ token, email: "someone.else@example.com" }, beforeCutoff);
    assert.deepEqual(link, { ok: true, email: ADDRESS, token });
  });

  it("refuses a bad token instead of falling back to the address", () => {
    const link = resolveUnsubscribeLink({ token: "forged", email: ADDRESS }, beforeCutoff);
    assert.deepEqual(link, { ok: false, reason: "invalid" });
  });

  it("re-issues a legacy address as a token that expires with the window", () => {
    const link = resolveUnsubscribeLink({ email: " Fan.Of.Greenroom@example.com" }, beforeCutoff);
    assert.equal(link.ok, true);
    if (!link.ok) return;
    assert.equal(link.email, ADDRESS);
    assert.equal(link.token.includes("greenroom"), false);
    assert.equal(readUnsubscribeToken(link.token, beforeCutoff), ADDRESS);
    assert.equal(readUnsubscribeToken(link.token, LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL), null);
  });

  it("refuses legacy addresses from the cutoff on", () => {
    assert.deepEqual(resolveUnsubscribeLink({ email: ADDRESS }, LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL), {
      ok: false,
      reason: "expired",
    });
  });

  it("refuses a legacy value that isn't an address", () => {
    assert.deepEqual(resolveUnsubscribeLink({ email: "nope" }, beforeCutoff), {
      ok: false,
      reason: "invalid",
    });
  });

  it("reports a request carrying neither as missing", () => {
    const missing = { ok: false, reason: "missing" };
    assert.deepEqual(resolveUnsubscribeLink({}), missing);
    assert.deepEqual(resolveUnsubscribeLink({ token: "", email: "" }), missing);
    assert.deepEqual(resolveUnsubscribeLink({ token: null, email: null }), missing);
  });
});

describe("maskEmail", () => {
  it("keeps the first and last character of the local part, and the domain", () => {
    assert.equal(maskEmail("benjamin@gmail.com"), "b•••n@gmail.com");
  });

  it("hides how long the local part is", () => {
    assert.equal(maskEmail("bob@example.com"), "b•••b@example.com");
    assert.equal(maskEmail("bartholomew@example.com"), "b•••w@example.com");
  });

  it("shows only the first character of a one- or two-character local part", () => {
    assert.equal(maskEmail("ab@example.com"), "a•••@example.com");
    assert.equal(maskEmail("a@example.com"), "a•••@example.com");
  });

  it("masks a value with no local part entirely", () => {
    assert.equal(maskEmail("@example.com"), "•••");
    assert.equal(maskEmail("not-an-address"), "•••");
  });
});

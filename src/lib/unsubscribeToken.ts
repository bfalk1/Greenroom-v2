import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { normalizeEmail } from "./normalizeEmail";

// Opaque tokens for the unsubscribe links in our emails.
//
// The links used to carry the recipient's address (/unsubscribe?email=…).
// Every tracker in the root layout records the page URL (Meta and TikTok
// pixels, the Google tag, PostHog), so each unsubscribe click handed the
// address to all of them, which Google's policies forbid, and anyone could opt
// out any address they knew. Links now carry a token instead.
//
// The token SEALS the address with AES-256-GCM rather than signing it. A signed
// payload still has to carry the address, and base64 hides nothing; a user-id
// token can't cover recipients without an account (creator invitees). GCM
// authenticates as well as encrypts, so nobody without the key can forge or
// alter a token, and the server reads the address back with no DB lookup.
//
// SERVER ONLY — imports node:crypto. Never import this from a client component.

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;
// A 254-character address (the SMTP maximum) seals to about 430 characters.
const MAX_TOKEN_LENGTH = 1024;
const DEV_SECRET = "gr-unsubscribe-token-dev-secret";

// Emails sent before tokens shipped link to ?email=<address>. Those links keep
// working until this date, about six months on and far past CAN-SPAM's 30-day
// minimum. From then on ?email= is refused and only tokens unsubscribe.
export const LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL = new Date("2027-03-15T00:00:00Z");

// Secrets, newest first: tokens are sealed with the first and opened with any.
// UNSUBSCRIBE_TOKEN_SECRET is the dedicated key. Until it's set, tokens fall
// back to STRIPE_SECRET_KEY (always set in production; vipOffer.ts uses the
// same fallback), and that key stays accepted afterwards, so setting the
// dedicated secret later breaks no link already sent. The dev constant only
// applies outside production: a deploy with neither variable throws instead of
// minting tokens anyone could forge from this file.
function tokenSecrets(): string[] {
  const secrets = [process.env.UNSUBSCRIBE_TOKEN_SECRET, process.env.STRIPE_SECRET_KEY]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
  if (process.env.NODE_ENV !== "production") secrets.push(DEV_SECRET);
  return secrets;
}

// The AES key is derived, not the raw secret: secrets come in any length, and
// the Stripe fallback is also vipOffer.ts's HMAC key, so a purpose label keeps
// the two uses independent.
function keyFor(secret: string): Buffer {
  return createHmac("sha256", secret).update("greenroom:unsubscribe-token:v1").digest();
}

// Token layout, base64url-encoded: version (1 byte, also the GCM associated
// data) | IV (12) | auth tag (16) | sealed JSON { e: address, x?: expiry in
// unix seconds }.
export function createUnsubscribeToken(
  email: string,
  options: { expiresAt?: Date } = {}
): string {
  const [secret] = tokenSecrets();
  if (!secret) {
    throw new Error(
      "Unsubscribe links need UNSUBSCRIBE_TOKEN_SECRET (or STRIPE_SECRET_KEY) to be set"
    );
  }

  const payload: { e: string; x?: number } = { e: normalizeEmail(email) };
  if (options.expiresAt) payload.x = Math.floor(options.expiresAt.getTime() / 1000);

  const header = Buffer.from([VERSION]);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(header);
  const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

// Returns the address a token was minted for, or null when the token is
// malformed, forged, altered, sealed under a key we no longer hold, or past its
// expiry. Never throws.
export function readUnsubscribeToken(token: string, now: Date = new Date()): string | null {
  if (token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  // Refuse non-canonical spellings too (spare bits set in the last character),
  // so every valid token has exactly one string form.
  if (
    bytes.length <= HEADER_BYTES ||
    bytes[0] !== VERSION ||
    bytes.toString("base64url") !== token
  ) {
    return null;
  }

  const header = bytes.subarray(0, 1);
  const iv = bytes.subarray(1, 1 + IV_BYTES);
  const tag = bytes.subarray(1 + IV_BYTES, HEADER_BYTES);
  const sealed = bytes.subarray(HEADER_BYTES);

  for (const secret of tokenSecrets()) {
    let plaintext: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(header);
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8");
    } catch {
      continue; // not sealed under this secret, or tampered with
    }
    return parsePayload(plaintext, now);
  }
  return null;
}

function parsePayload(plaintext: string, now: Date): string | null {
  try {
    const { e, x } = JSON.parse(plaintext) as { e?: unknown; x?: unknown };
    if (typeof e !== "string" || !e.includes("@")) return null;
    if (x !== undefined && (typeof x !== "number" || x * 1000 <= now.getTime())) return null;
    return e;
  } catch {
    return null;
  }
}

export type UnsubscribeLink =
  | { ok: true; email: string; token: string }
  | { ok: false; reason: "missing" | "invalid" | "expired" };

// Resolves what an unsubscribe request carried: a token, or a legacy ?email=.
// The /unsubscribe page and both /api/unsubscribe handlers share it so they
// agree on precedence. A token always wins, and a bad one is refused rather
// than falling back to an address sent alongside it. A legacy address comes
// back re-issued as a token that expires with the transition window, so
// minting tokens from bare addresses (which the window allows anyway) yields
// nothing that outlives it.
export function resolveUnsubscribeLink(
  params: { token?: string | null; email?: string | null },
  now: Date = new Date()
): UnsubscribeLink {
  if (params.token) {
    const email = readUnsubscribeToken(params.token, now);
    return email ? { ok: true, email, token: params.token } : { ok: false, reason: "invalid" };
  }

  if (params.email) {
    if (now.getTime() >= LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL.getTime()) {
      return { ok: false, reason: "expired" };
    }
    const email = normalizeEmail(params.email);
    if (!email.includes("@")) return { ok: false, reason: "invalid" };
    const token = createUnsubscribeToken(email, { expiresAt: LEGACY_EMAIL_LINKS_ACCEPTED_UNTIL });
    return { ok: true, email, token };
  }

  return { ok: false, reason: "missing" };
}

// The confirmation page shows the address masked ("b•••n@gmail.com"). Anyone
// holding a link can load the page, and the trackers log its URL, so the page
// mustn't hand back the address the token hides.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = Array.from(email.slice(0, at));
  const visible = local.length > 2 ? `${local[0]}•••${local[local.length - 1]}` : `${local[0]}•••`;
  return `${visible}${email.slice(at)}`;
}

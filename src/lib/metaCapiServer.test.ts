import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import {
  buildCapiEvent,
  capiAttributionFromRequest,
  hashEmail,
  sha256Lower,
} from "./metaCapiServer";
import { purchaseEventId } from "./metaPixel";

const UA = "Mozilla/5.0 (Macintosh) TestAgent/1.0";

test("hashEmail normalizes (trim + lowercase) before SHA-256, per Meta's em rules", () => {
  const expected = createHash("sha256")
    .update("buyer@example.com", "utf8")
    .digest("hex");
  assert.equal(hashEmail("  Buyer@Example.COM  "), expected);
  assert.equal(hashEmail("buyer@example.com"), expected);
  // Lowercase hex, 64 chars — the exact format Meta matches on.
  assert.match(hashEmail("buyer@example.com"), /^[0-9a-f]{64}$/);
});

test("purchaseEventId is the client/server dedup contract", () => {
  // The browser pixel sends this as eventID, the Conversions API as event_id.
  // Meta only dedups on an exact byte match — if this format changes, BOTH
  // channels change together (single source), but the localStorage keys of
  // in-flight buyers ("metapixel:once:purchase:<txn>") assume this prefix.
  assert.equal(purchaseEventId("cs_test_123"), "purchase:cs_test_123");
  assert.equal(purchaseEventId("I-ABC123"), "purchase:I-ABC123");
});

test("buildCapiEvent refuses to build without a client user agent", () => {
  // client_user_agent is REQUIRED for action_source=website — sending
  // without it draws a 400 for the whole batch, so the builder returns null
  // (callers skip + warn) rather than emitting an invalid event.
  const event = buildCapiEvent({
    eventName: "Purchase",
    eventId: purchaseEventId("cs_x"),
    eventTimeSeconds: 1_784_000_000,
    email: "buyer@example.com",
    userId: "user-1",
    attribution: { fbp: "fb.1.123.456" },
  });
  assert.equal(event, null);
});

test("buildCapiEvent emits all required website fields and hashes only what Meta hashes", () => {
  const event = buildCapiEvent({
    eventName: "Purchase",
    eventId: purchaseEventId("cs_test_123"),
    eventTimeSeconds: 1_784_000_000.9,
    email: " Buyer@Example.com ",
    userId: "uuid-42",
    attribution: {
      fbp: "fb.1.1700000000.1234567890",
      fbc: "fb.1.1700000000.AbCdEfGh",
      clientIp: "203.0.113.9",
      clientUserAgent: UA,
      eventSourceUrl: "https://www.greenroom.fm/checkout",
    },
    customData: { value: 17.99, currency: "USD", content_name: "VIP" },
  });

  assert.ok(event, "event should build when the user agent is present");
  assert.equal(event.event_name, "Purchase");
  // Unix SECONDS, floored to an integer — milliseconds reject the batch.
  assert.equal(event.event_time, 1_784_000_000);
  assert.equal(event.event_id, "purchase:cs_test_123");
  assert.equal(event.action_source, "website");
  assert.equal(event.event_source_url, "https://www.greenroom.fm/checkout");

  const userData = event.user_data as Record<string, unknown>;
  // em/external_id: SHA-256 arrays. fbp/fbc/IP/UA: raw, NEVER hashed.
  assert.deepEqual(userData.em, [hashEmail("buyer@example.com")]);
  assert.deepEqual(userData.external_id, [sha256Lower("uuid-42")]);
  assert.equal(userData.fbp, "fb.1.1700000000.1234567890");
  assert.equal(userData.fbc, "fb.1.1700000000.AbCdEfGh");
  assert.equal(userData.client_ip_address, "203.0.113.9");
  assert.equal(userData.client_user_agent, UA);

  assert.deepEqual(event.custom_data, {
    value: 17.99,
    currency: "USD",
    content_name: "VIP",
  });
});

test("buildCapiEvent omits absent identity fields instead of sending empties", () => {
  const event = buildCapiEvent({
    eventName: "AddPaymentInfo",
    eventId: "addpayment:cs_y",
    eventTimeSeconds: 1_784_000_000,
    email: "   ",
    userId: null,
    attribution: { clientUserAgent: UA, fbp: "", fbc: null },
  });

  assert.ok(event);
  const userData = event.user_data as Record<string, unknown>;
  assert.equal("em" in userData, false);
  assert.equal("external_id" in userData, false);
  assert.equal("fbp" in userData, false);
  assert.equal("fbc" in userData, false);
  assert.equal("client_ip_address" in userData, false);
  assert.equal(userData.client_user_agent, UA);
  // No custom_data given → key absent entirely (Meta rejects null blocks).
  assert.equal("custom_data" in event, false);
});

test("capiAttributionFromRequest bounds every value — oversized identifiers drop, prose truncates", () => {
  // Cookies are client-writable up to ~4KB. An unbounded value forwarded into
  // Stripe checkout-session metadata (500-char value limit) would make the
  // session create throw and 500 the checkout; a TRUNCATED fbc corrupts the
  // fbclid and misattributes. So identifiers drop when oversized, while
  // UA/referer (harmless to shorten) truncate.
  const goodFbp = "fb.1.1700000000.1234567890";
  const request = new Request("http://localhost/api/subscription/checkout", {
    headers: {
      "user-agent": "A".repeat(600),
      "x-forwarded-for": " 203.0.113.9 , 10.0.0.1",
      referer: "https://www.greenroom.fm/checkout?" + "q".repeat(600),
    },
  });
  const cookies: Record<string, string> = {
    _fbp: goodFbp,
    _fbc: "fb.1.1700000000." + "x".repeat(600),
  };
  const attr = capiAttributionFromRequest(request, (n) => cookies[n]);

  assert.equal(attr.fbp, goodFbp);
  assert.equal(attr.fbc, null, "oversized fbc drops, never truncates");
  assert.equal(attr.clientIp, "203.0.113.9");
  assert.equal(attr.clientUserAgent?.length, 400);
  assert.equal(attr.eventSourceUrl?.length, 500);

  const oversizedFbp = capiAttributionFromRequest(request, (n) =>
    n === "_fbp" ? "f".repeat(600) : undefined
  );
  assert.equal(oversizedFbp.fbp, null, "oversized fbp drops");
});

test("buildCapiEvent falls back to the app checkout URL when no referer was captured", () => {
  const event = buildCapiEvent({
    eventName: "Purchase",
    eventId: purchaseEventId("I-NOURL"),
    eventTimeSeconds: 1_784_000_000,
    attribution: { clientUserAgent: UA },
  });
  assert.ok(event);
  // event_source_url is required for website events — absence would 400.
  assert.match(String(event.event_source_url), /\/checkout$/);
});

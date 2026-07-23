import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { createServer } from "node:http";
import {
  buildCapiEvent,
  capiAttributionFromRequest,
  capiIdentityFromProfile,
  hashEmail,
  metaCapiAddPaymentInfo,
  sha256Lower,
  splitFullName,
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

test("buildCapiEvent hashes profile identifiers with Meta's normalization", () => {
  const event = buildCapiEvent({
    eventName: "AddPaymentInfo",
    eventId: "addpayment:cs_id",
    eventTimeSeconds: 1_784_000_000,
    userId: "uuid-1",
    identity: {
      firstName: "Jane",
      lastName: "O'Brien",
      city: "New York",
      state: "NY",
      zip: "94025-1234",
    },
    attribution: { clientUserAgent: UA },
  });
  assert.ok(event);
  const userData = event.user_data as Record<string, unknown>;
  // Names: trim + lowercase, apostrophe kept. City/state: lowercase, non-a-z
  // stripped ("New York" → "newyork"). Zip: first segment before the +4 hyphen.
  assert.deepEqual(userData.fn, [sha256Lower("jane")]);
  assert.deepEqual(userData.ln, [sha256Lower("o'brien")]);
  assert.deepEqual(userData.ct, [sha256Lower("newyork")]);
  assert.deepEqual(userData.st, [sha256Lower("ny")]);
  assert.deepEqual(userData.zp, [sha256Lower("94025")]);
});

test("buildCapiEvent omits blank/whitespace identity fields", () => {
  const event = buildCapiEvent({
    eventName: "AddPaymentInfo",
    eventId: "addpayment:cs_blank",
    eventTimeSeconds: 1_784_000_000,
    userId: "uuid-1",
    // A city of only punctuation normalizes to "" and must be dropped, not
    // sent as a hash of the empty string.
    identity: { firstName: "  ", lastName: null, city: "!!!", state: undefined },
    attribution: { clientUserAgent: UA },
  });
  assert.ok(event);
  const userData = event.user_data as Record<string, unknown>;
  assert.equal("fn" in userData, false);
  assert.equal("ln" in userData, false);
  assert.equal("ct" in userData, false);
  assert.equal("st" in userData, false);
  assert.equal("zp" in userData, false);
});

test("splitFullName puts the last token in ln, the rest in fn", () => {
  assert.deepEqual(splitFullName("Jane Q Public"), {
    firstName: "Jane Q",
    lastName: "Public",
  });
  assert.deepEqual(splitFullName("Cher"), {
    firstName: "Cher",
    lastName: null,
  });
  assert.deepEqual(splitFullName("  "), { firstName: null, lastName: null });
});

test("capiIdentityFromProfile splits the name and maps postalCode → zip", () => {
  assert.deepEqual(
    capiIdentityFromProfile({
      fullName: "Ada Lovelace",
      city: "London",
      state: null,
      postalCode: "SW1A",
    }),
    {
      firstName: "Ada",
      lastName: "Lovelace",
      city: "London",
      state: null,
      zip: "SW1A",
    }
  );
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

test("capiAttributionFromRequest falls back to gr_fbc when _fbc is absent, prefers _fbc when both exist", () => {
  // gr_fbc is the first-party click id middleware persists from the fbclid URL
  // param — the only fbc source for ad-clickers whose browser never wrote _fbc
  // (blocked fbevents / Safari ITP). It must fill in ONLY when _fbc is missing.
  const grFbc = "fb.1.1700000000.PAAaBbCcClickId";
  const realFbc = "fb.1.1700000009.RealCookieClickId";
  const req = () =>
    new Request("http://localhost/api/subscription/checkout", {
      headers: { "user-agent": UA },
    });

  // _fbc absent -> use gr_fbc
  const fallback = capiAttributionFromRequest(req(), (n) =>
    n === "gr_fbc" ? grFbc : undefined
  );
  assert.equal(fallback.fbc, grFbc, "gr_fbc backstops a missing _fbc");

  // both present -> Meta's own _fbc wins
  const both = capiAttributionFromRequest(req(), (n) =>
    n === "_fbc" ? realFbc : n === "gr_fbc" ? grFbc : undefined
  );
  assert.equal(both.fbc, realFbc, "_fbc is canonical when present");
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

test("metaCapiAddPaymentInfo reports a numeric value + ISO currency (Meta flags value-less commerce events)", async () => {
  // Integration-style: point the sender at a local stub via META_GRAPH_API_BASE
  // (the documented test seam) and assert what actually goes over the wire —
  // the value/currency composition lives inside the send, not in buildCapiEvent.
  const bodies: { data: Record<string, unknown>[] }[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ events_received: 1 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const prev = {
    pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    token: process.env.META_CAPI_ACCESS_TOKEN,
    base: process.env.META_GRAPH_API_BASE,
  };
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";
  process.env.META_CAPI_ACCESS_TOKEN = "test-token";
  process.env.META_GRAPH_API_BASE = `http://127.0.0.1:${address.port}`;
  try {
    const eventId = metaCapiAddPaymentInfo({
      userId: "user-1",
      email: "buyer@example.com",
      tier: "VIP",
      valueUsdCents: 1799,
      transactionId: "cs_test_addpay",
      attribution: { clientUserAgent: UA, fbp: "fb.1.123.456" },
    });
    assert.equal(eventId, "addpayment:cs_test_addpay");
    // Fire-and-forget send: outside a Next request scope it dispatches
    // immediately — wait for the stub to receive it.
    const deadline = Date.now() + 3000;
    while (bodies.length < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(bodies.length, 1, "stub never received the CAPI send");
    const event = bodies[0].data[0] as {
      event_name: string;
      custom_data: Record<string, unknown>;
    };
    assert.equal(event.event_name, "AddPaymentInfo");
    // Numeric dollars + ISO-4217 code — the exact shape Events Manager
    // demands; a string like "$17.99" or a word like "Canadian" is malformed.
    assert.equal(event.custom_data.value, 17.99);
    assert.equal(event.custom_data.currency, "USD");
    assert.deepEqual(event.custom_data.contents, [{ id: "VIP", quantity: 1 }]);
    assert.equal(event.custom_data.content_name, "VIP");
  } finally {
    if (prev.pixel === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    else process.env.NEXT_PUBLIC_META_PIXEL_ID = prev.pixel;
    if (prev.token === undefined) delete process.env.META_CAPI_ACCESS_TOKEN;
    else process.env.META_CAPI_ACCESS_TOKEN = prev.token;
    if (prev.base === undefined) delete process.env.META_GRAPH_API_BASE;
    else process.env.META_GRAPH_API_BASE = prev.base;
    server.close();
  }
});

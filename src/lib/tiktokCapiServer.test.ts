import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { createServer } from "node:http";
import {
  buildTikTokCapiEvent,
  hashEmail,
  sha256Hex,
  tiktokCapiEnabled,
  tiktokCapiPurchase,
} from "./tiktokCapiServer";
import { purchaseEventId } from "./metaPixel";

const UA = "Mozilla/5.0 (iPhone; TikTok in-app) TestAgent/1.0";

async function waitFor(predicate: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

test("hashEmail normalizes (trim + lowercase) before SHA-256", () => {
  const expected = createHash("sha256")
    .update("buyer@example.com", "utf8")
    .digest("hex");
  assert.equal(hashEmail("  Buyer@Example.COM  "), expected);
  assert.match(hashEmail("buyer@example.com"), /^[0-9a-f]{64}$/);
});

test("external_id is a PLAIN sha256 of the raw user id — the browser-parity contract", () => {
  // src/lib/hashClient.ts sha256Hex(user.id) in the browser must produce the
  // SAME digest tiktokSetIdentity pre-hashes with, or TikTok resolves the
  // browser and server halves to two different people and dedup is moot.
  // No lowercasing, no trimming of the id itself — just SHA-256 hex.
  const userId = "3f9a1c7e-0000-4444-8888-abcdefabcdef";
  const expected = createHash("sha256").update(userId, "utf8").digest("hex");
  assert.equal(sha256Hex(userId), expected);

  const event = buildTikTokCapiEvent({
    event: "CompletePayment",
    eventId: purchaseEventId("cs_x"),
    eventTimeSeconds: 1_784_000_000,
    userId,
    attribution: { clientUserAgent: UA },
  });
  const user = event.user as Record<string, unknown>;
  assert.equal(user.external_id, expected);
});

test("builds without a user agent — deliberately UNLIKE Meta's builder", () => {
  // metaCapiServer's buildCapiEvent returns null with no client_user_agent
  // because Meta rejects the batch. TikTok can still match on
  // email/external_id, and dropping the event would put us back at the zero
  // server-side coverage this module exists to fix.
  const event = buildTikTokCapiEvent({
    event: "CompletePayment",
    eventId: purchaseEventId("cs_no_ua"),
    eventTimeSeconds: 1_784_000_000,
    email: "buyer@example.com",
    userId: "user-1",
    attribution: {},
  });
  assert.ok(event);
  const user = event.user as Record<string, unknown>;
  assert.equal(user.email, hashEmail("buyer@example.com"));
  assert.equal(user.user_agent, undefined);
  assert.equal(user.ip, undefined);
});

test("hashes what TikTok hashes, leaves raw what TikTok wants raw", () => {
  const event = buildTikTokCapiEvent({
    event: "CompletePayment",
    eventId: purchaseEventId("cs_raw"),
    eventTimeSeconds: 1_784_000_000.9,
    email: "Buyer@Example.com",
    userId: "user-9",
    attribution: {
      clientUserAgent: UA,
      clientIp: "203.0.113.7",
      eventSourceUrl: "https://www.greenroom.fm/checkout/complete",
    },
  });
  const user = event.user as Record<string, unknown>;
  // Hashed.
  assert.match(user.email as string, /^[0-9a-f]{64}$/);
  assert.match(user.external_id as string, /^[0-9a-f]{64}$/);
  // Raw — hashing these would make them unmatchable.
  assert.equal(user.user_agent, UA);
  assert.equal(user.ip, "203.0.113.7");
  // event_time is Unix SECONDS, floored.
  assert.equal(event.event_time, 1_784_000_000);
  assert.deepEqual(event.page, {
    url: "https://www.greenroom.fm/checkout/complete",
  });
});

test("the purchase event is CompletePayment and keys on the browser's dedup id", () => {
  // TikTok's purchase event is NOT called "Purchase" (that is Meta's name,
  // and confusingly also what Events Manager DISPLAYS this as). The event_id
  // must byte-match tiktokTrackOnce's dedupeKey or one sale counts twice.
  const bodies: Array<Record<string, unknown>> = [];
  const headers: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      headers.push(req.headers as Record<string, unknown>);
      bodies.push(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, message: "OK" }));
    });
  });

  return new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const prev = {
        pixel: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
        token: process.env.TIKTOK_ACCESS_TOKEN,
        base: process.env.TIKTOK_EVENTS_API_BASE,
        code: process.env.TIKTOK_CAPI_TEST_EVENT_CODE,
      };
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "DA1VKV3C77U9RA6QLR20";
      process.env.TIKTOK_ACCESS_TOKEN = "test-token";
      process.env.TIKTOK_EVENTS_API_BASE = `http://127.0.0.1:${address.port}`;
      process.env.TIKTOK_CAPI_TEST_EVENT_CODE = "TEST03146";
      try {
        assert.equal(tiktokCapiEnabled(), true);
        tiktokCapiPurchase({
          userId: "user-1",
          email: "buyer@example.com",
          tier: "VIP",
          valueUsdCents: 1799,
          transactionId: "cs_test_seam",
          attribution: { clientUserAgent: UA, clientIp: "203.0.113.7" },
        });
        await waitFor(() => bodies.length > 0);
        assert.equal(bodies.length, 1);

        const body = bodies[0];
        assert.equal(body.event_source, "web");
        assert.equal(body.event_source_id, "DA1VKV3C77U9RA6QLR20");
        // The test event code routes this to Events Manager's Test Events tab
        // instead of live reporting.
        assert.equal(body.test_event_code, "TEST03146");
        // Auth rides the HEADER, not the body — the opposite of Meta, which
        // puts access_token in the payload.
        assert.equal(headers[0]["access-token"], "test-token");
        assert.equal(body.access_token, undefined);

        const data = body.data as Array<Record<string, unknown>>;
        assert.equal(data.length, 1);
        assert.equal(data[0].event, "CompletePayment");
        assert.equal(data[0].event_id, purchaseEventId("cs_test_seam"));
        assert.equal(data[0].event_id, "purchase:cs_test_seam");

        const props = data[0].properties as Record<string, unknown>;
        assert.equal(props.value, 17.99);
        assert.equal(props.currency, "USD");
        // TikTok's contents[] use content_id/price — Meta's use id/item_price.
        assert.deepEqual(props.contents, [
          {
            content_id: "VIP",
            content_name: "VIP",
            quantity: 1,
            price: 17.99,
          },
        ]);
      } finally {
        process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = prev.pixel;
        process.env.TIKTOK_ACCESS_TOKEN = prev.token;
        process.env.TIKTOK_EVENTS_API_BASE = prev.base;
        process.env.TIKTOK_CAPI_TEST_EVENT_CODE = prev.code;
        server.close(() => done());
      }
    });
  });
});

test("HTTP 200 with a non-zero code is treated as the rejection it is", () => {
  // TikTok answers a rejected payload with 200 OK and code != 0. Checking
  // res.ok alone would swallow every rejection silently — exactly the class
  // of failure that made conversions look fine while reporting zero.
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ code: 40001, message: "Invalid access token" })
      );
    });
  });

  return new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const prev = {
        pixel: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
        token: process.env.TIKTOK_ACCESS_TOKEN,
        base: process.env.TIKTOK_EVENTS_API_BASE,
      };
      const errors: string[] = [];
      const realError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "DA1VKV3C77U9RA6QLR20";
      process.env.TIKTOK_ACCESS_TOKEN = "bad-token";
      process.env.TIKTOK_EVENTS_API_BASE = `http://127.0.0.1:${address.port}`;
      try {
        tiktokCapiPurchase({
          userId: "user-1",
          tier: "VIP",
          valueUsdCents: 1799,
          transactionId: "cs_rejected",
          attribution: { clientUserAgent: UA },
        });
        await waitFor(() => errors.length > 0);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /code 40001/);
        assert.match(errors[0], /purchase:cs_rejected/);
      } finally {
        console.error = realError;
        process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = prev.pixel;
        process.env.TIKTOK_ACCESS_TOKEN = prev.token;
        process.env.TIKTOK_EVENTS_API_BASE = prev.base;
        server.close(() => done());
      }
    });
  });
});

test("inert without config — no pixel id or no token sends nothing", () => {
  const prev = {
    pixel: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    token: process.env.TIKTOK_ACCESS_TOKEN,
  };
  try {
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "DA1VKV3C77U9RA6QLR20";
    delete process.env.TIKTOK_ACCESS_TOKEN;
    assert.equal(tiktokCapiEnabled(), false);

    delete process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
    process.env.TIKTOK_ACCESS_TOKEN = "test-token";
    assert.equal(tiktokCapiEnabled(), false);

    // A send with no config must not throw — local/dev/test run unconfigured.
    assert.doesNotThrow(() =>
      tiktokCapiPurchase({
        userId: "user-1",
        tier: "VIP",
        valueUsdCents: 1799,
        transactionId: "cs_inert",
        attribution: {},
      })
    );
  } finally {
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = prev.pixel;
    process.env.TIKTOK_ACCESS_TOKEN = prev.token;
  }
});

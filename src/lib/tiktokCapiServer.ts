import { createHash } from "crypto";
import { after } from "next/server";
import { tiktokPixelId } from "./tiktokPixel";
import { purchaseEventId } from "./metaPixel";

// TikTok Events API 2.0 — the server-side counterpart to the browser pixel in
// src/lib/tiktokPixel.ts, and the exact twin of src/lib/metaCapiServer.ts.
//
// Why this exists: the browser pixel alone loses every conversion whose
// browser never reaches /checkout/complete intact. TikTok ad traffic arrives
// in TikTok's in-app browser, and when the payment redirect hands off to the
// system browser the _ttp/ttclid cookies do NOT follow — so the conversion
// either never fires or fires unattributable. /checkout/complete timeouts
// (PayPal activation lag) lose it outright: that path hands Meta's conversion
// to the CAPI and, until this file, handed TikTok's to nothing at all.
//
// TikTok deduplicates browser and server by (event, event_id), so the event_id
// here MUST byte-match what tiktokTrackOnce sends — purchaseEventId(txn), the
// same token Meta keys on. tiktokPixel.ts has passed that handle on
// CompletePayment since it shipped, specifically for this.
//
// Entirely inert unless BOTH NEXT_PUBLIC_TIKTOK_PIXEL_ID and
// TIKTOK_ACCESS_TOKEN are set: every call silently no-ops, so local/dev/test
// environments need no TikTok config.
//
// Payload rules (Events API v1.3, event_source=web):
// - Auth is the `Access-Token` HEADER, not a body field (Meta puts its token
//   in the body — do not copy that here).
// - email / phone / external_id are SHA-256 hashed; ip / user_agent / ttclid
//   / ttp stay RAW.
// - event_time is Unix SECONDS.
// - TikTok's purchase event is "CompletePayment", NOT "Purchase" — though
//   Events Manager DISPLAYS it under the Events API 2.0 name "Purchase".

const EVENTS_API_VERSION = "v1.3";

// Browser signals captured at checkout time and carried to the activation
// paths via Stripe metadata / CheckoutAttribution rows. Structurally a subset
// of metaCapiServer's CapiAttribution, so the call sites hand the SAME object
// to both channels — TikTok simply ignores the Meta-specific fbp/fbc.
export interface TikTokCapiAttribution {
  clientIp?: string | null;
  clientUserAgent?: string | null;
  eventSourceUrl?: string | null;
}

interface TikTokCapiEventInput {
  event: "CompletePayment";
  // Must byte-match the browser pixel's event_id or the two channels count as
  // two conversions instead of one.
  eventId: string;
  eventTimeSeconds: number;
  email?: string | null;
  // Our user id — sent hashed as external_id.
  userId?: string | null;
  attribution: TikTokCapiAttribution;
  properties?: Record<string, unknown>;
}

function accessToken(): string | undefined {
  return process.env.TIKTOK_ACCESS_TOKEN?.trim() || undefined;
}

function eventsApiBase(): string {
  // Overridable so tests can point sends at a local stub.
  return (
    process.env.TIKTOK_EVENTS_API_BASE?.trim() ||
    "https://business-api.tiktok.com"
  );
}

export function tiktokCapiEnabled(): boolean {
  return Boolean(tiktokPixelId() && accessToken());
}

// TikTok hashes with plain SHA-256 hex, same as Meta. Kept as its own export
// rather than importing metaCapiServer's sha256Lower so this module carries no
// dependency on the Meta channel.
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// TikTok's normalization for email: trim + lowercase, then hash. Identical to
// Meta's rule, and to what events.js does in the browser — which is what makes
// the browser and server halves resolve to the same person.
export function hashEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

export function buildTikTokCapiEvent(
  input: TikTokCapiEventInput
): Record<string, unknown> {
  const user: Record<string, unknown> = {};
  if (input.email?.trim()) user.email = hashEmail(input.email);
  // Plain sha256 of the raw id — byte-identical to the browser's
  // sha256Hex(user.id) in src/lib/hashClient.ts, which is the whole point:
  // tiktokSetIdentity pre-hashes external_id the same way so a deduplicated
  // event resolves to one person, not two.
  if (input.userId?.trim()) user.external_id = sha256Hex(input.userId.trim());
  // Raw, never hashed. Unlike Meta, a missing user_agent does NOT disqualify
  // the send: TikTok can still match on email/external_id, and dropping the
  // event would put us back where we started.
  if (input.attribution.clientUserAgent?.trim()) {
    user.user_agent = input.attribution.clientUserAgent.trim();
  }
  if (input.attribution.clientIp?.trim()) {
    user.ip = input.attribution.clientIp.trim();
  }

  return {
    event: input.event,
    event_time: Math.floor(input.eventTimeSeconds),
    event_id: input.eventId,
    user,
    ...(input.properties ? { properties: input.properties } : {}),
    page: {
      url:
        input.attribution.eventSourceUrl?.trim() ||
        `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim()}/checkout`,
    },
  };
}

/**
 * Send one event to the Events API. Fire-and-forget: never throws, and the
 * network call is deferred with after() so the payment path never waits on
 * TikTok and a frozen lambda can't drop the send. No retry — the activation
 * slots behind these calls are exactly-once, so a lost send is a lost event,
 * still strictly better than the browser-only status quo.
 *
 * GOTCHA that has no Meta equivalent: TikTok answers a REJECTED payload with
 * HTTP 200 and a non-zero `code` in the body. Checking res.ok alone would
 * swallow every rejection silently, which is precisely the failure mode this
 * whole exercise was spent diagnosing — so the body is parsed and a non-zero
 * code is logged as the error it is.
 */
export function sendTikTokCapiEvent(input: TikTokCapiEventInput): void {
  const pixelId = tiktokPixelId();
  const token = accessToken();
  if (!pixelId || !token) return;

  const testEventCode = process.env.TIKTOK_CAPI_TEST_EVENT_CODE?.trim();
  const body = JSON.stringify({
    event_source: "web",
    event_source_id: pixelId,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
    data: [buildTikTokCapiEvent(input)],
  });
  const url = `${eventsApiBase()}/open_api/${EVENTS_API_VERSION}/event/track/`;

  const send = async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": token,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        console.error(
          `TikTok Events API: ${input.event} ${input.eventId} rejected (${res.status}): ${text.slice(0, 500)}`
        );
        return;
      }
      // HTTP 200 but code !== 0 is still a rejection — see the note above.
      let code: unknown;
      try {
        code = (JSON.parse(text) as { code?: unknown }).code;
      } catch {
        code = undefined;
      }
      if (code !== undefined && code !== 0) {
        console.error(
          `TikTok Events API: ${input.event} ${input.eventId} rejected (code ${String(code)}): ${text.slice(0, 500)}`
        );
      }
    } catch (err) {
      console.error(
        `TikTok Events API: ${input.event} ${input.eventId} send failed:`,
        err
      );
    }
  };

  try {
    after(send);
  } catch {
    // Outside a request scope (scripts/tests) — best-effort immediate send.
    void send();
  }
}

/**
 * The server-authoritative CompletePayment — fired from the same exactly-once
 * activation slots as metaCapiPurchase (Stripe webhook, Stripe reconcile cron,
 * PayPal sync), so it reaches TikTok even when the buyer's browser was an
 * in-app webview that lost its cookies at the payment handoff.
 *
 * transactionId must be the SAME token the browser pixel keys on (Stripe
 * checkout-session id / PayPal subscription id) or dedup silently fails and
 * ad-attributed purchases double-count.
 */
export function tiktokCapiPurchase(props: {
  userId: string;
  email?: string | null;
  tier: string;
  valueUsdCents: number;
  currency?: string | null;
  transactionId: string;
  attribution: TikTokCapiAttribution;
}): void {
  const value = props.valueUsdCents / 100;
  sendTikTokCapiEvent({
    event: "CompletePayment",
    eventId: purchaseEventId(props.transactionId),
    eventTimeSeconds: Date.now() / 1000,
    email: props.email,
    userId: props.userId,
    attribution: props.attribution,
    // Mirrors the browser pixel's CompletePayment properties in
    // src/lib/analytics.ts — TikTok's contents[] use content_id/price, NOT
    // Meta's id/item_price.
    properties: {
      content_type: "product",
      content_name: props.tier,
      contents: [
        {
          content_id: props.tier,
          content_name: props.tier,
          quantity: 1,
          price: value,
        },
      ],
      value,
      currency: (props.currency || "USD").toUpperCase(),
    },
  });
}

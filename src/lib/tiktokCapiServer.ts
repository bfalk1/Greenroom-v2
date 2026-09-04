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
  // The STAMPED click id (tt.1.<ms>.<ttclid>), same convention metaFbc uses —
  // only the <ttclid> segment goes on the wire, see rawTtclid.
  ttclid?: string | null;
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
  // The click id, raw and unhashed. This is the single highest-value match
  // key TikTok has: email proves WHO bought, ttclid proves WHICH AD CLICK
  // they came from. Without it a matched conversion still can't be credited
  // to the campaign that paid for it.
  const clickId = rawTtclid(input.attribution.ttclid);
  if (clickId) user.ttclid = clickId;

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

// --- Durable click id (the twin of metaCapiServer's fbc plumbing) ---

// Our stamped wrapper: tt.1.<first-seen-ms>.<ttclid>. The <ttclid> charset is
// deliberately WIDER than Meta's fbclid rule — a real TikTok click id looks
// like "E.C.P.xxxxx", so a dot-free charset would reject every one of them.
const TTCLID_FORMAT = /^tt\.\d+\.\d+\.[A-Za-z0-9._-]{1,400}$/;

export function normalizeTtclid(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > 500) return null;
  return TTCLID_FORMAT.test(v) ? v : null;
}

// The wire value. TikTok wants the click id exactly as it appeared in the URL
// — the tt.1.<ms>. prefix is bookkeeping of ours and must be stripped, or the
// id matches nothing. Splitting on "." would corrupt an id that contains dots
// (they all do), hence the anchored capture.
export function rawTtclid(value: string | null | undefined): string | null {
  const v = normalizeTtclid(value);
  const m = v?.match(/^tt\.\d+\.\d+\.(.+)$/);
  return m ? m[1] : null;
}

// Only gr_ttclid, the stamped copy our middleware mints from the ?ttclid URL
// param. TikTok's own `ttclid` cookie is deliberately NOT read: events.js
// writes it raw, with no timestamp, so it cannot take part in the
// latest-click-wins comparison below — and middleware sees the same URL param
// at the same moment anyway, so nothing is lost by preferring our copy.
export function ttclidFromCookies(
  cookieValue: (name: string) => string | undefined
): string | null {
  return normalizeTtclid(cookieValue("gr_ttclid"));
}

// How long a banked click id stays usable. Shorter than Meta's 90 days on
// purpose: TikTok's own ttclid cookie lives ~30 days and its longest click
// attribution window is 28, so an older id would add noise, not conversions.
export const USER_TTCLID_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// First-sight time embedded in a stamped value; 0 when absent/malformed so
// comparisons treat "nothing" as oldest.
export function ttclidClickTimeMs(value: string | null | undefined): number {
  const v = normalizeTtclid(value);
  if (!v) return 0;
  const ms = Number(v.split(".")[2]);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Fall back to the click id banked on the user row (see /api/user/me) when the
 * live request carried none — the whole reason the column exists. TikTok ad
 * traffic lands in TikTok's in-app browser; when the payment redirect hands
 * off to the system browser, the cookies do not follow, so activation sees no
 * click id at all. A live cookie always wins; the stored id must be fresh by
 * BOTH bounds (bank time and embedded first-sight time), so an id banked on
 * day 29 of its life cannot buy itself a second 30-day lease.
 */
export function withUserTtclidFallback(
  attr: TikTokCapiAttribution,
  user:
    | { tiktokTtclid: string | null; tiktokTtclidUpdatedAt: Date | null }
    | null
    | undefined,
  nowMs: number = Date.now()
): TikTokCapiAttribution {
  const live = normalizeTtclid(attr.ttclid);
  if (live) return { ...attr, ttclid: live };
  const stored = normalizeTtclid(user?.tiktokTtclid);
  const bankedAt = user?.tiktokTtclidUpdatedAt?.getTime();
  if (
    !stored ||
    !bankedAt ||
    nowMs - bankedAt > USER_TTCLID_MAX_AGE_MS ||
    nowMs - ttclidClickTimeMs(stored) > USER_TTCLID_MAX_AGE_MS
  ) {
    return { ...attr, ttclid: live };
  }
  return { ...attr, ttclid: stored };
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

import { createHash } from "crypto";
import { after } from "next/server";
import { metaPixelId, purchaseEventId } from "./metaPixel";

// Meta Conversions API (server-side counterpart to the browser pixel in
// src/lib/metaPixel.ts). The pixel alone loses every conversion made in a
// browser that blocks connect.facebook.net (ad blockers, Safari/Brave
// tracking prevention) and every /checkout/complete timeout — this file
// reports the same standard events from the server, where nothing can be
// blocked. Meta deduplicates the two channels by (event_name, event_id)
// within 48h, so each event here MUST byte-match the eventID the pixel sends
// (see metaTrack/metaTrackOnce callers in src/lib/analytics.ts).
//
// Entirely inert unless BOTH NEXT_PUBLIC_META_PIXEL_ID and
// META_CAPI_ACCESS_TOKEN are set: every call below silently no-ops, so
// local/dev/test environments need no Meta config.
//
// Payload rules (Graph API v25.0, action_source=website):
// - client_user_agent and event_source_url are REQUIRED — events without a
//   captured user agent are skipped rather than sent mislabeled.
// - em / external_id are SHA-256 hashed (email lowercased+trimmed first);
//   fbp / fbc / client_ip_address / client_user_agent must stay RAW.
// - event_time is Unix SECONDS and must be under 7 days old (all callers
//   fire at the moment of the event, so this only constrains clock bugs).

const GRAPH_API_VERSION = "v25.0";

// Browser signals captured at checkout time (the only moment they exist) and
// carried to the activation paths via Stripe metadata / CheckoutAttribution
// rows. All optional — a missing fbp/fbc just weakens match quality, but a
// missing clientUserAgent skips the send (required field, see above).
export interface CapiAttribution {
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  eventSourceUrl?: string | null;
}

interface CapiEventInput {
  eventName: "Purchase" | "AddPaymentInfo";
  // Must byte-match the browser pixel's eventID for dedup: the pixel event
  // and this server event count as ONE conversion only if these agree.
  eventId: string;
  eventTimeSeconds: number;
  email?: string | null;
  // Our user id — sent hashed as external_id for identity matching.
  userId?: string | null;
  attribution: CapiAttribution;
  customData?: Record<string, unknown>;
}

function accessToken(): string | undefined {
  return process.env.META_CAPI_ACCESS_TOKEN?.trim() || undefined;
}

function graphApiBase(): string {
  // Overridable so integration tests can point sends at a local stub.
  return (
    process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com"
  );
}

export function metaCapiEnabled(): boolean {
  return Boolean(metaPixelId() && accessToken());
}

export function sha256Lower(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Meta's normalization rules for em: trim whitespace, lowercase, then hash.
export function hashEmail(email: string): string {
  return sha256Lower(email.trim().toLowerCase());
}

/**
 * Pure payload builder, separated from the send for testability. Returns
 * null when the event cannot legally be sent (no user agent captured — a
 * required field for action_source=website).
 */
export function buildCapiEvent(
  input: CapiEventInput
): Record<string, unknown> | null {
  const ua = input.attribution.clientUserAgent?.trim();
  if (!ua) return null;

  const userData: Record<string, unknown> = {
    client_user_agent: ua,
  };
  if (input.email?.trim()) userData.em = [hashEmail(input.email)];
  if (input.userId?.trim()) {
    userData.external_id = [sha256Lower(input.userId.trim())];
  }
  if (input.attribution.fbp?.trim()) userData.fbp = input.attribution.fbp.trim();
  if (input.attribution.fbc?.trim()) userData.fbc = input.attribution.fbc.trim();
  if (input.attribution.clientIp?.trim()) {
    userData.client_ip_address = input.attribution.clientIp.trim();
  }

  return {
    event_name: input.eventName,
    event_time: Math.floor(input.eventTimeSeconds),
    event_id: input.eventId,
    action_source: "website",
    event_source_url:
      input.attribution.eventSourceUrl?.trim() ||
      `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim()}/checkout`,
    user_data: userData,
    ...(input.customData ? { custom_data: input.customData } : {}),
  };
}

/**
 * Send one event to the Conversions API. Fire-and-forget: never throws, and
 * the actual network call is deferred until after the response is sent (same
 * after() rationale as analyticsServer.ts — the payment path must not wait
 * on Meta, and a frozen lambda must not drop the send). A Meta outage or a
 * rejected payload logs and is otherwise absorbed; there is no retry — the
 * activation paths behind these calls are exactly-once, so a lost send is a
 * lost event, which is still strictly better than the pixel-only status quo.
 */
export function sendMetaCapiEvent(input: CapiEventInput): void {
  const pixelId = metaPixelId();
  const token = accessToken();
  if (!pixelId || !token) return;

  const event = buildCapiEvent(input);
  if (!event) {
    console.warn(
      `Meta CAPI: skipped ${input.eventName} ${input.eventId} — no client_user_agent captured (required for website events)`
    );
    return;
  }

  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim();
  const body = JSON.stringify({
    data: [event],
    access_token: token,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  });
  const url = `${graphApiBase()}/${GRAPH_API_VERSION}/${pixelId}/events`;

  const send = async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          `Meta CAPI: ${input.eventName} ${input.eventId} rejected (${res.status}): ${text.slice(0, 500)}`
        );
      }
    } catch (err) {
      console.error(
        `Meta CAPI: ${input.eventName} ${input.eventId} send failed:`,
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
 * The server-authoritative Purchase — fired from the same exactly-once
 * activation slots as trackSubscriptionActivatedServer (Stripe webhook,
 * Stripe reconcile cron, PayPal sync), so it reaches Meta even when the
 * buyer's browser blocked the pixel or /checkout/complete timed out.
 * transactionId must be the SAME token the browser pixel keys on (Stripe
 * checkout-session id / PayPal subscription id) or dedup silently fails and
 * ad-attributed purchases double-count.
 */
export function metaCapiPurchase(props: {
  userId: string;
  email?: string | null;
  tier: string;
  valueUsdCents: number;
  currency?: string | null;
  transactionId: string;
  attribution: CapiAttribution;
}): void {
  sendMetaCapiEvent({
    eventName: "Purchase",
    eventId: purchaseEventId(props.transactionId),
    eventTimeSeconds: Date.now() / 1000,
    email: props.email,
    userId: props.userId,
    attribution: props.attribution,
    customData: {
      content_category: "subscription",
      content_name: props.tier,
      content_type: "product",
      value: props.valueUsdCents / 100,
      currency: (props.currency || "USD").toUpperCase(),
    },
  });
}

/**
 * Server-side AddPaymentInfo, fired from the checkout routes at the moment
 * the provider session/subscription is created — the buyer's own request is
 * in scope there, so attribution is complete. The route returns the eventId
 * to the client, which passes it to the pixel as eventID for dedup.
 */
export function metaCapiAddPaymentInfo(props: {
  userId: string;
  email?: string | null;
  tier: string;
  transactionId: string;
  attribution: CapiAttribution;
}): string {
  const eventId = `addpayment:${props.transactionId}`;
  sendMetaCapiEvent({
    eventName: "AddPaymentInfo",
    eventId,
    eventTimeSeconds: Date.now() / 1000,
    email: props.email,
    userId: props.userId,
    attribution: props.attribution,
    customData: {
      content_category: "subscription",
      content_name: props.tier,
    },
  });
  return eventId;
}

/**
 * Capture the browser signals off a checkout request. Only meaningful on
 * routes the BUYER's browser calls directly (the checkout POSTs) — webhook
 * and cron requests carry the provider's headers, not the buyer's.
 * cookieValue should come from the route's `await cookies()` store (house
 * idiom), passed in so this stays a pure header/string transform.
 */
// Identifier values (fbp/fbc/IP) are DROPPED when oversized rather than
// truncated: a cut-off fbclid is a corrupt click id that misattributes, while
// an absent one just falls back to em/external_id matching. UA and referer
// truncate harmlessly. Every bound sits at or under Stripe's 500-char
// metadata-value limit — cookies are client-writable (a browser allows ~4KB),
// and an unbounded value forwarded into checkout-session metadata would make
// stripe.checkout.sessions.create throw, turning one garbage _fbp cookie into
// a persistent checkout 500 for that buyer.
function boundedIdentifier(
  value: string | null | undefined,
  max: number
): string | null {
  const v = value?.trim();
  return v && v.length <= max ? v : null;
}

export function capiAttributionFromRequest(
  request: Request,
  cookieValue: (name: string) => string | undefined
): CapiAttribution {
  return {
    fbp: boundedIdentifier(cookieValue("_fbp"), 500),
    fbc: boundedIdentifier(cookieValue("_fbc"), 500),
    clientIp: boundedIdentifier(
      request.headers.get("x-forwarded-for")?.split(",")[0],
      64
    ),
    clientUserAgent:
      request.headers.get("user-agent")?.trim().slice(0, 400) || null,
    eventSourceUrl: request.headers.get("referer")?.trim().slice(0, 500) || null,
  };
}

// Stripe metadata round-trip: written onto the checkout session AND the
// subscription at creation (src/app/api/subscription/checkout/route.ts), read
// back at whichever activation path fires — the webhook reads session
// metadata, the reconcile cron reads subscription metadata. Key names are
// capi-prefixed so they can't collide with the existing userId /
// acquisitionSource attribution keys. Values are guaranteed under Stripe's
// 500-char metadata limit by capiAttributionFromRequest — the only producer.
export function capiAttributionToMetadata(
  attr: CapiAttribution
): Record<string, string> {
  const md: Record<string, string> = {};
  if (attr.fbp) md.capiFbp = attr.fbp;
  if (attr.fbc) md.capiFbc = attr.fbc;
  if (attr.clientIp) md.capiClientIp = attr.clientIp;
  if (attr.clientUserAgent) md.capiUserAgent = attr.clientUserAgent;
  if (attr.eventSourceUrl) md.capiSourceUrl = attr.eventSourceUrl;
  return md;
}

export function capiAttributionFromMetadata(
  md: Partial<Record<string, string>> | null | undefined
): CapiAttribution {
  return {
    fbp: md?.capiFbp || null,
    fbc: md?.capiFbc || null,
    clientIp: md?.capiClientIp || null,
    clientUserAgent: md?.capiUserAgent || null,
    eventSourceUrl: md?.capiSourceUrl || null,
  };
}

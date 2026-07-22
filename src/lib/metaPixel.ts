// Meta (Facebook) Pixel wrapper. Entirely inert unless NEXT_PUBLIC_META_PIXEL_ID
// is set: no script is loaded, every call below no-ops. This is the ads-side
// counterpart to PostHog (src/lib/analytics.ts) — PostHog answers "what happened
// in the funnel", the pixel exists so Meta can attribute and optimize ad
// delivery, so only the handful of standard events Meta optimizes on are sent.

interface FbqFunction {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: FbqFunction;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

// The standard events this app sends, in funnel order. Meta only optimizes ad
// delivery against its predefined standard-event names — don't invent names
// here (custom events need fbq("trackCustom", ...) and can't be optimization
// goals directly).
export type MetaStandardEvent =
  | "ViewContent" // /pricing rendered (the plan listing is the product view)
  | "CompleteRegistration" // signup succeeded
  | "InitiateCheckout" // /checkout rendered
  | "AddPaymentInfo" // buyer committed to a provider (checkout API called)
  | "Purchase"; // subscription verified ACTIVE on /checkout/complete

export function metaPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || undefined;
}

// The Purchase event id, shared verbatim by the browser pixel (eventID) and
// the server-side Conversions API (event_id) — Meta dedups the two channels
// only on an exact byte match, so both sides derive it here. transactionId is
// the provider's per-transaction token: Stripe checkout-session id (cs_...)
// or PayPal subscription id (I-...).
export function purchaseEventId(transactionId: string): string {
  return `purchase:${transactionId}`;
}

// Programmatic equivalent of Meta's inline base-code snippet: install the fbq
// stub (which queues calls until fbevents.js loads and replays them), inject
// the script, and bind the pixel ID. Idempotent — remounts and dev fast
// refresh hit the window.fbq guard. Called lazily from every wrapper below,
// not just from the <MetaPixel /> mount effect: on a HARD load, a page's own
// mount effects flush before MetaPixel's (it is the last sibling in the root
// layout), and a conversion fired from one of them (e.g. InitiateCheckout on
// a direct /checkout landing — the ad-click cohort) must install the stub and
// queue rather than be dropped.
export function initMetaPixel(): FbqFunction | null {
  const id = metaPixelId();
  if (typeof window === "undefined" || !id) return null;
  if (window.fbq) return window.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as FbqFunction;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", id);
  return fbq;
}

export function metaPageView() {
  const fbq = initMetaPixel();
  if (!fbq) return;
  fbq("track", "PageView");
}

// eventID (optional) is Meta's browser↔server dedup handle: when the
// Conversions API sends the same event server-side (src/lib/metaCapiServer.ts),
// both carry one shared id and Meta counts them as a single conversion.
// It must BYTE-match the server's event_id — same casing, same prefix.
export function metaTrack(
  event: MetaStandardEvent,
  params?: Record<string, unknown>,
  eventID?: string
) {
  const fbq = initMetaPixel();
  if (!fbq) return;
  if (eventID) {
    fbq("track", event, params, { eventID });
  } else {
    fbq("track", event, params);
  }
}

// Once-per-browser variant for conversion events that a page refresh would
// re-fire (e.g. Purchase on /checkout/complete: reloading the page re-verifies
// the subscription and would re-send). Meta has no browser-side dedup without
// the Conversions API, and inflated Purchase counts skew ROAS and ad
// optimization, so under-counting on cleared storage is the better failure
// mode than over-counting on every refresh. Key on a PER-TRANSACTION id, not
// a stable trait like the tier name — a coarse key permanently suppresses
// later legitimate conversions (re-subscribe after cancel, second account on
// a shared browser) from this browser.
// The dedupeKey doubles as the Meta eventID: it is already per-transaction,
// and the server-side Conversions API Purchase uses the same
// `purchase:<transactionId>` string as its event_id, so Meta dedups the two
// channels even when localStorage was unavailable and this fired a repeat.
export function metaTrackOnce(
  dedupeKey: string,
  event: MetaStandardEvent,
  params?: Record<string, unknown>
) {
  const fbq = initMetaPixel();
  if (!fbq) return;
  const storageKey = `metapixel:once:${dedupeKey}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Storage unavailable (private mode / blocked): fire anyway — a possible
    // duplicate beats silently dropping the conversion.
  }
  fbq("track", event, params, { eventID: dedupeKey });
}

// Hand a conversion's ownership to the Conversions API WITHOUT firing the
// pixel: sets the same localStorage marker metaTrackOnce checks. Used when
// /checkout/complete times out — the server will fire the CAPI Purchase at
// activation, and a buyer revisiting the same completion URL days later
// (outside Meta's 48h event_id dedup window) must not add a second,
// undeduplicatable browser Purchase on top of it.
export function metaSuppressOnce(dedupeKey: string) {
  try {
    window.localStorage.setItem(
      `metapixel:once:${dedupeKey}`,
      new Date().toISOString()
    );
  } catch {
    // Storage unavailable — nothing to suppress with; accept the small
    // double-count risk rather than throwing in the completion flow.
  }
}

// Local copy of metaCapiServer.splitFullName — that module can't be imported
// into this browser file (it pulls in Node's crypto and next/server). Same
// rule: the last whitespace-separated token is the surname.
function splitName(
  fullName: string | null | undefined
): [string | null, string | null] {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return [null, null];
  if (parts.length === 1) return [parts[0], null];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

// SHA-256 hex via Web Crypto, byte-matching the server's sha256Lower(userId)
// so the pixel's external_id equals the CAPI external_id and Meta treats the
// two channels as the same person. crypto.subtle needs a secure context
// (https / localhost); returns null if unavailable so external_id is simply
// omitted rather than sent malformed.
async function sha256Hex(value: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

// Advanced Matching — the browser-side counterpart to the CAPI user_data in
// src/lib/metaCapiServer.ts. Without it the pixel sends NO email/name/address
// for its half of every event, so Events Manager sees identifiers on only
// ~50% of event instances (the CAPI half). Re-initing the pixel with a
// user_data object attaches these to all subsequent events; fbevents itself
// normalizes + SHA-256 hashes em/fn/ln/ct/st/zp from the raw values we pass,
// so raw never leaves the browser un-hashed. external_id is the one field
// fbevents does NOT hash, so we pre-hash the id to match the CAPI side. Called
// from the UserContext identify point once the signed-in user is known.
export async function metaSetAdvancedMatching(user: {
  id: string;
  email?: string | null;
  fullName?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): Promise<void> {
  const fbq = initMetaPixel();
  const id = metaPixelId();
  if (!fbq || !id) return;

  const matching: Record<string, string> = {};
  if (user.email?.trim()) matching.em = user.email.trim();
  const [firstName, lastName] = splitName(user.fullName);
  if (firstName) matching.fn = firstName;
  if (lastName) matching.ln = lastName;
  if (user.city?.trim()) matching.ct = user.city.trim();
  if (user.state?.trim()) matching.st = user.state.trim();
  if (user.postalCode?.trim()) matching.zp = user.postalCode.trim();
  const externalId = await sha256Hex(user.id);
  if (externalId) matching.external_id = externalId;

  fbq("init", id, matching);
}

// Drop the previous user's identifiers on logout so a later event on a shared
// browser can't carry a signed-out person's match keys. Re-inits with empty
// values, which fbevents overwrites the stored advanced-matching data with.
export function metaClearAdvancedMatching() {
  const fbq = initMetaPixel();
  const id = metaPixelId();
  if (!fbq || !id) return;
  fbq("init", id, {
    em: "",
    fn: "",
    ln: "",
    ct: "",
    st: "",
    zp: "",
    external_id: "",
  });
}

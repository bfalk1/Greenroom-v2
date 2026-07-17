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
  | "CompleteRegistration" // signup succeeded
  | "InitiateCheckout" // /checkout rendered
  | "AddPaymentInfo" // buyer committed to a provider (checkout API called)
  | "Purchase"; // subscription verified ACTIVE on /checkout/complete

export function metaPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || undefined;
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

export function metaTrack(
  event: MetaStandardEvent,
  params?: Record<string, unknown>
) {
  const fbq = initMetaPixel();
  if (!fbq) return;
  fbq("track", event, params);
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
  fbq("track", event, params);
}

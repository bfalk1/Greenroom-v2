// TikTok Pixel wrapper. Entirely inert unless NEXT_PUBLIC_TIKTOK_PIXEL_ID is
// set: no script is loaded, every call below no-ops. Like src/lib/metaPixel.ts,
// this is an ads-side counterpart to PostHog (src/lib/analytics.ts) — PostHog
// answers "what happened in the funnel", the pixel exists so TikTok can
// attribute and optimize ad delivery, so only the handful of standard events
// TikTok optimizes on are sent.

// The queued stub TikTok's base snippet installs: an array whose method calls
// push [method, ...args] onto it until events.js loads and replays them. Only
// the members this app touches are typed; the rest live behind the loader.
interface TtqStub {
  page: (...args: unknown[]) => void;
  track: (
    event: string,
    params?: Record<string, unknown>,
    options?: { event_id?: string }
  ) => void;
  identify: (data: Record<string, unknown>) => void;
  load: (pixelId: string, options?: Record<string, unknown>) => void;
  instance: (pixelId: string) => unknown;
  setAndDefer: (target: TtqStub, method: string) => void;
  methods: string[];
  push: (...items: unknown[]) => number;
  _i?: Record<string, unknown>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
}

declare global {
  interface Window {
    ttq?: TtqStub;
    TiktokAnalyticsObject?: string;
  }
}

// The standard events this app sends, in funnel order. TikTok only optimizes ad
// delivery against its predefined standard-event names — don't invent names
// here. Note the names diverge from Meta's: TikTok's purchase event is
// "CompletePayment", not "Purchase".
export type TikTokStandardEvent =
  | "ViewContent" // /pricing rendered (the plan listing is the product view)
  | "CompleteRegistration" // signup succeeded
  | "InitiateCheckout" // /checkout rendered
  | "AddPaymentInfo" // buyer committed to a provider (checkout API called)
  | "CompletePayment"; // subscription verified ACTIVE on /checkout/complete

export function tiktokPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim() || undefined;
}

// Programmatic equivalent of TikTok's inline base-code snippet: install the ttq
// stub (which queues calls until events.js loads and replays them), inject the
// script, and bind the pixel ID. Idempotent — remounts and dev fast refresh hit
// the window.ttq guard. Called lazily from every wrapper below, not just from
// the <TikTokPixel /> mount effect: on a HARD load, a page's own mount effects
// flush before TikTokPixel's (it is a last sibling in the root layout), and a
// conversion fired from one of them (e.g. InitiateCheckout on a direct
// /checkout landing — the ad-click cohort) must install the stub and queue
// rather than be dropped.
export function initTikTokPixel(): TtqStub | null {
  const id = tiktokPixelId();
  if (typeof window === "undefined" || !id) return null;
  if (window.ttq) return window.ttq;

  window.TiktokAnalyticsObject = "ttq";
  const ttq = [] as unknown as TtqStub;
  ttq.methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
    "holdConsent",
    "revokeConsent",
    "grantConsent",
  ];
  ttq.setAndDefer = function (target: TtqStub, method: string) {
    (target as unknown as Record<string, (...args: unknown[]) => void>)[method] =
      function (...args: unknown[]) {
        target.push([method, ...args]);
      };
  };
  for (let i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }
  ttq.instance = function (pixelId: string) {
    const inst = ((ttq._i && ttq._i[pixelId]) || []) as TtqStub;
    for (let n = 0; n < ttq.methods.length; n++) {
      ttq.setAndDefer(inst, ttq.methods[n]);
    }
    return inst;
  };
  ttq.load = function (pixelId: string, options?: Record<string, unknown>) {
    const url = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {};
    ttq._i[pixelId] = [];
    (ttq._i[pixelId] as { _u?: string })._u = url;
    ttq._t = ttq._t || {};
    ttq._t[pixelId] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[pixelId] = options || {};
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `${url}?sdkid=${pixelId}&lib=ttq`;
    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  };

  window.ttq = ttq;
  ttq.load(id);
  return ttq;
}

export function tiktokPageView() {
  const ttq = initTikTokPixel();
  if (!ttq) return;
  ttq.page();
}

// event_id (optional) is TikTok's browser↔server dedup handle for when a
// matching event is also sent through the Events API. There is no TikTok
// server-side channel in this app today, so it is normally omitted; it is still
// passed on the once-guarded CompletePayment so a future Events API twin would
// dedup cleanly.
export function tiktokTrack(
  event: TikTokStandardEvent,
  params?: Record<string, unknown>,
  eventId?: string
) {
  const ttq = initTikTokPixel();
  if (!ttq) return;
  if (eventId) {
    ttq.track(event, params, { event_id: eventId });
  } else {
    ttq.track(event, params);
  }
}

// Once-per-browser variant for conversion events that a page refresh would
// re-fire (e.g. CompletePayment on /checkout/complete: reloading the page
// re-verifies the subscription and would re-send). TikTok has no browser-side
// dedup without the Events API, and inflated purchase counts skew ROAS and ad
// optimization, so under-counting on cleared storage is the better failure mode
// than over-counting on every refresh. Key on a PER-TRANSACTION id, not a
// stable trait like the tier name — a coarse key permanently suppresses later
// legitimate conversions (re-subscribe after cancel, second account on a shared
// browser) from this browser. The key is namespaced separately from the Meta
// pixel's marker so the two channels fire independently.
export function tiktokTrackOnce(
  dedupeKey: string,
  event: TikTokStandardEvent,
  params?: Record<string, unknown>
) {
  const ttq = initTikTokPixel();
  if (!ttq) return;
  const storageKey = `tiktokpixel:once:${dedupeKey}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Storage unavailable (private mode / blocked): fire anyway — a possible
    // duplicate beats silently dropping the conversion.
  }
  ttq.track(event, params, { event_id: dedupeKey });
}

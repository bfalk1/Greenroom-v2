// Google tag (gtag.js) bootstrap for the root layout: which Google products
// are configured, and the inline snippet that turns them on.
//
// Two build-inlined env ids, each optional:
//   NEXT_PUBLIC_GOOGLE_ADS_ID        "AW-…"  Google Ads conversion tracking
//   NEXT_PUBLIC_GOOGLE_ANALYTICS_ID  "G-…"   Google Analytics 4 site traffic
// With neither set GoogleTag renders nothing, so dev/preview stay clean.
//
// One gtag.js load serves both: each `config` command makes gtag.js fetch
// that id's own container, so the loader URL only needs one of them. Ads
// stays the loader when present, so an Ads-only deployment makes the same
// gtag calls it did before Analytics existed.
//
// Kept free of React/Next so the snippet itself can be unit tested.

// Ids are interpolated into an inline script, so only a bare tag id is
// accepted. Anything else (a whole pasted install snippet, stray quotes) is
// dropped with a warning instead of rendered: a syntax error in the shared
// snippet would silently take the other product's tag down with it.
const TAG_ID = /^[A-Z]{1,3}-[A-Z0-9]+$/;

function tagId(envName: string, raw: string | undefined): string | undefined {
  const id = raw?.trim();
  if (!id) return undefined;
  if (TAG_ID.test(id)) return id;
  console.warn(`[GoogleTag] ignoring ${envName}: not a Google tag id`);
  return undefined;
}

export interface GoogleTagSnippet {
  /** gtag.js loader URL. */
  src: string;
  /** Inline bootstrap: dataLayer stub, js timestamp, one config per id. */
  init: string;
}

export function googleTagSnippet(env: {
  adsId?: string;
  analyticsId?: string;
}): GoogleTagSnippet | null {
  const adsId = tagId("NEXT_PUBLIC_GOOGLE_ADS_ID", env.adsId);
  const analyticsId = tagId("NEXT_PUBLIC_GOOGLE_ANALYTICS_ID", env.analyticsId);
  const loaderId = adsId ?? analyticsId;
  if (!loaderId) return null;

  const lines = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
  ];
  // allow_enhanced_conversions is what lets gtag.js TRANSMIT the user_data that
  // googleAdsSetUserData (src/lib/googleAds.ts) stages — without it the data is
  // staged and silently never sent. Whether Google USES it is the separate
  // per-conversion-action Enhanced Conversions toggle in the Ads account.
  if (adsId) {
    lines.push(`gtag('config', '${adsId}', { allow_enhanced_conversions: true });`);
  }
  // GA4 sends the first page_view from config; its enhanced measurement
  // ("page changes based on browser history events") covers SPA navigations.
  if (analyticsId) {
    lines.push(`gtag('config', '${analyticsId}');`);
  }

  return {
    src: `https://www.googletagmanager.com/gtag/js?id=${loaderId}`,
    init: lines.join("\n"),
  };
}

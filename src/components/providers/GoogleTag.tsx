import Script from "next/script";

// Google tag (gtag.js), used here for Google Ads conversion tracking. Like the
// Meta pixel and PostHog, this is entirely inert unless NEXT_PUBLIC_GOOGLE_ADS_ID
// is set: no script is loaded and no gtag calls fire, so dev/preview stay clean
// and the tag only lives where the env var is configured (Vercel prod).
//
// This is the App Router equivalent of Google's inline snippet: next/script with
// afterInteractive loads gtag.js after hydration, and the sibling inline script
// installs the dataLayer/gtag stub and runs config. gtag.js records the first
// page automatically and, being a history-aware tag, follows SPA navigations on
// its own — so unlike MetaPixel there is no manual per-route PageView here.
export function GoogleTag() {
  const id = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}');
        `}
      </Script>
    </>
  );
}

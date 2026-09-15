import Script from "next/script";
import { googleTagSnippet } from "@/lib/googleTag";

// Google tag (gtag.js), used here for Google Ads conversion tracking and Google
// Analytics 4. Like the Meta pixel and PostHog, this is entirely inert unless
// NEXT_PUBLIC_GOOGLE_ADS_ID and/or NEXT_PUBLIC_GOOGLE_ANALYTICS_ID is set: no
// script is loaded and no gtag calls fire, so dev/preview stay clean and the
// tag only lives where the env vars are configured (Vercel prod). Which ids
// load, and the snippet itself, are decided in src/lib/googleTag.ts.
//
// This is the App Router equivalent of Google's inline snippet: next/script with
// afterInteractive loads gtag.js after hydration, and the sibling inline script
// installs the dataLayer/gtag stub and runs config. gtag.js records the first
// page automatically and, being a history-aware tag, follows SPA navigations on
// its own — so unlike MetaPixel there is no manual per-route PageView here.
export function GoogleTag() {
  const snippet = googleTagSnippet({
    adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    analyticsId: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID,
  });
  if (!snippet) return null;

  return (
    <>
      <Script src={snippet.src} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {snippet.init}
      </Script>
    </>
  );
}

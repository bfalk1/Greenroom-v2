"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { tiktokPageView } from "@/lib/tiktokPixel";

// TikTok Pixel for ad attribution. Renders nothing, loads nothing unless
// NEXT_PUBLIC_TIKTOK_PIXEL_ID is set. PageViews are fired manually on pathname
// change because this is an SPA — the base code alone would only record the
// first page of each session. Unlike PostHogPageview, query-string changes
// deliberately do NOT re-fire (marketplace filter/search updates would spam
// PageView); the pixel still reads the full URL, ttclid included, at send time.
export function TikTokPixel() {
  return (
    <Suspense fallback={null}>
      <TikTokPixelPageview />
    </Suspense>
  );
}

function TikTokPixelPageview() {
  const pathname = usePathname();

  // tiktokPageView self-initializes the pixel (initTikTokPixel is idempotent
  // and the ttq stub queues until events.js loads), so the first PageView both
  // installs the pixel and is never dropped.
  useEffect(() => {
    if (pathname) tiktokPageView();
  }, [pathname]);

  return null;
}

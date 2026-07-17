"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { metaPageView } from "@/lib/metaPixel";

// Meta (Facebook) Pixel for ad attribution. Renders nothing, loads nothing
// unless NEXT_PUBLIC_META_PIXEL_ID is set. PageViews are fired manually on
// pathname change because this is an SPA — the base code alone would only
// record the first page of each session. Unlike PostHogPageview, query-string
// changes deliberately do NOT re-fire (marketplace filter/search updates would
// spam PageView); the pixel still reads the full URL, fbclid included, at
// send time.
export function MetaPixel() {
  return (
    <Suspense fallback={null}>
      <MetaPixelPageview />
    </Suspense>
  );
}

function MetaPixelPageview() {
  const pathname = usePathname();

  // metaPageView self-initializes the pixel (initMetaPixel is idempotent and
  // the fbq stub queues until fbevents.js loads), so the first PageView both
  // installs the pixel and is never dropped.
  useEffect(() => {
    if (pathname) metaPageView();
  }, [pathname]);

  return null;
}

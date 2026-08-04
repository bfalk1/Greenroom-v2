"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { currentPlatform, isDesktopApp } from "@/lib/platform";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
    if (typeof window !== "undefined" && posthogKey) {
      posthog.init(posthogKey, {
        api_host: (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").trim(),
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: true,
        loaded: (ph) => {
          if (process.env.NODE_ENV === "development") {
            ph.debug();
          }
        },
      });

      // Label every event with the surface it came from ("desktop_app" for
      // the Electron shell, "web" for a browser). Registered as a super
      // property so all captures carry it; person-level first/last_platform
      // ride on identify (see identifyUser). Mirrors AppShell's re-checks:
      // the Electron preload can attach after init, so a "web" verdict gets
      // re-tested briefly and upgraded in place (events before the flip keep
      // "web" — bounded by the last check at 1s).
      posthog.register({ platform: currentPlatform() });
      if (!isDesktopApp()) {
        const checks = [100, 300, 500, 1000];
        const timers = checks.map((ms) =>
          setTimeout(() => {
            if (isDesktopApp()) {
              posthog.register({ platform: "desktop_app" });
            }
          }, ms)
        );
        return () => timers.forEach((t) => clearTimeout(t));
      }
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      const params = searchParams?.toString();
      if (params) {
        url += "?" + params;
      }
      // platform is passed explicitly (not only via the super property)
      // because this effect runs before the parent's init effect: a fresh
      // visitor's first $pageview is queued pre-init and can flush before
      // register() has run. Entry pageviews feed the bounce/entry-page
      // dashboards, so that first event must be labeled too.
      posthog.capture("$pageview", {
        $current_url: url,
        platform: currentPlatform(),
      });
    }
  }, [pathname, searchParams]);

  return null;
}

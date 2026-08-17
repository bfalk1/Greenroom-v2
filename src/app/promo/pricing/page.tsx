"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { eurostile } from "@/lib/fonts";
import { trackPromoOfferViewed } from "@/lib/analytics";
import PricingPageContent from "@/components/pricing/PricingPageContent";

// The promo funnel's plan grid — /pricing verbatim, with the VIP monthly card
// carrying the $5.99-first-month intro offer. It lives outside (main) so ad
// traffic gets the promo shell (no app chrome) instead of the signed-in
// AppShell, exactly like /promo itself. The discount is enforced server-side.

export default function PromoPricingPage() {
  // Same top-of-funnel view event as /promo — a visitor who lands straight on
  // this URL (shared link, back-navigation) still counts as an offer view.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackPromoOfferViewed("grid");
  }, []);

  return (
    <div
      className={`${eurostile.variable} min-h-screen bg-[#050505] text-white`}
      style={{ fontFamily: "var(--font-eurostile)" }}
    >
      {/* Nav */}
      <header className="relative z-50 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/promo">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM"
            className="h-6 md:h-7"
          />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-[#a1a1a1] transition hover:text-white"
        >
          Sign in
        </Link>
      </header>

      <PricingPageContent promo basePath="/promo/pricing" />

      {/* Footer */}
      <footer className="border-t border-white/5 px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM"
            className="h-6 opacity-80"
          />
          <div className="flex items-center gap-6 text-sm text-[#777]">
            <Link href="/promo" className="transition hover:text-white">
              The offer
            </Link>
            <Link href="/marketplace" className="transition hover:text-white">
              Marketplace
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

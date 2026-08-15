"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { display } from "@/lib/fonts";
import { VIP_FIRST_MONTH_OFFER } from "@/lib/stripe/publicPriceConfig";
import {
  trackPromoOfferViewed,
  trackPromoPlanSelected,
} from "@/lib/analytics";
import LandingPageContent from "@/components/landing/LandingPageContent";

// Public "$5.99 first month" VIP intro page — the shareable ad/email landing
// page for the offer. It is the landing page, verbatim, with the offer band
// sitting directly under the hero and every CTA pointing at /promo/pricing
// (the standard plan grid, VIP discounted) instead of /pricing. Unlike /vip
// (password-gated, lifetime price) there is no unlock step: anyone can reach
// checkout from here, and the server enforces the real rules (VIP only,
// never-paid accounts, configured coupon/plan) before any charge.

const FEATURES = [
  `${VIP_FIRST_MONTH_OFFER.credits} fresh credits every month`,
  "Unused credits roll over",
  "100% royalty free samples",
  "Cancel anytime",
];

function VipOfferBand() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Hand off to the unified /checkout page (payment-method chooser + inline
  // signup for anonymous buyers). promo=1 is only a hint — the checkout APIs
  // re-verify tier, config, and never-paid eligibility before discounting.
  const claimOffer = () => {
    trackPromoPlanSelected(VIP_FIRST_MONTH_OFFER.tierName);
    setLoading(true);
    router.push(`/checkout?tier=${VIP_FIRST_MONTH_OFFER.tierName}&promo=1`);
  };

  return (
    <section className="relative border-y border-[#39b54a]/25 bg-[#39b54a]/[0.04] px-5 py-12 sm:px-8 sm:py-14">
      <style>{`
        @keyframes gr-deal-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(57,181,74,0.5); transform: translateX(-50%) scale(1); }
          50% { box-shadow: 0 0 34px rgba(57,181,74,0.95); transform: translateX(-50%) scale(1.05); }
        }
      `}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[620px] -translate-x-1/2 rounded-full opacity-25 blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, rgba(57,181,74,0.5), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        {/* Copy */}
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#39b54a]/30 bg-[#39b54a]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-[#39b54a]">
            <Sparkles className="h-3.5 w-3.5" />
            Intro offer
          </p>
          <h2
            style={display}
            className="text-[clamp(1.9rem,4.4vw,3.2rem)] uppercase leading-[0.95] tracking-[-0.01em]"
          >
            <span className="text-white">Your first month,</span>{" "}
            <span
              className="text-[#39b54a]"
              style={{ textShadow: "0 0 50px rgba(0,255,136,0.4)" }}
            >
              ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}
            </span>
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
            Get the VIP plan — {VIP_FIRST_MONTH_OFFER.credits} credits of 100%
            royalty-free samples — for ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}{" "}
            your first month, then ${VIP_FIRST_MONTH_OFFER.regularPrice} per
            month thereafter. Cancel anytime.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm">
                <Check className="h-4 w-4 shrink-0 text-[#39b54a]" />
                <span className="text-[#bdbdbd]">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Offer card */}
        <div className="relative mx-auto w-full max-w-md">
          <div className="relative flex flex-col rounded-2xl border border-[#39b54a] bg-gradient-to-b from-[#39b54a]/[0.16] to-transparent p-7 ring-1 ring-[#39b54a]/40 shadow-[0_28px_70px_-22px_rgba(0,255,136,0.7)]">
            <span
              className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#39b54a] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-black sm:px-5 sm:text-sm"
              style={{ animation: "gr-deal-pulse 2.4s ease-in-out infinite" }}
            >
              <Sparkles className="h-4 w-4" />
              First month ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}
            </span>

            <div className="flex items-start justify-between gap-3 pt-2">
              <h3
                style={display}
                className="text-xl uppercase tracking-wide text-white"
              >
                VIP
              </h3>

              <div className="flex shrink-0 items-end gap-1.5">
                <span className="pb-0.5 text-sm font-semibold text-red-500 line-through decoration-red-500 decoration-2">
                  ${VIP_FIRST_MONTH_OFFER.regularPrice}
                </span>
                <span className="text-3xl font-bold leading-none text-white">
                  ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}
                </span>
                <span className="pb-0.5 text-sm text-[#a1a1a1]">
                  first month
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
              <Zap className="h-5 w-5 text-[#39b54a]" />
              <span className="font-semibold text-white">
                {VIP_FIRST_MONTH_OFFER.credits} credits
              </span>
              <span className="text-sm text-[#a1a1a1]">/ month</span>
            </div>

            <button
              onClick={claimOffer}
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#39b54a] py-3.5 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_28px_rgba(0,255,136,0.4)] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Claim the offer
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs leading-relaxed text-[#777]">
              ${VIP_FIRST_MONTH_OFFER.firstMonthPrice} for your first month,
              then ${VIP_FIRST_MONTH_OFFER.regularPrice} per month thereafter.
              Cancel anytime. New members only.
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-[#777]">
            Want more (or fewer) credits?{" "}
            <Link
              href="/promo/pricing"
              className="text-[#39b54a] hover:text-white"
            >
              Compare all plans
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default function PromoPage() {
  // Top of the promo funnel + the Meta/TikTok product view — once per mount
  // (ref-guarded against StrictMode double-fire, same as /pricing).
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackPromoOfferViewed();
  }, []);

  // Returning from a canceled checkout (Stripe cancel_url / PayPal back-out).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "true") {
      toast.info("Checkout canceled — no charges were made.");
      window.history.replaceState({}, "", "/promo");
    }
  }, []);

  return (
    <LandingPageContent
      ctaHref="/promo/pricing"
      ctaPrefix="promo_"
      homeHref="/promo"
      afterHero={<VipOfferBand />}
    />
  );
}

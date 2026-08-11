"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { eurostile, display } from "@/lib/fonts";
import { VIP_FIRST_MONTH_OFFER } from "@/lib/stripe/publicPriceConfig";
import {
  trackPromoOfferViewed,
  trackPromoPlanSelected,
} from "@/lib/analytics";
import { DemoVideo } from "@/components/marketing/DemoVideo";

// Public "$5.99 first month" VIP intro page — the shareable ad/email landing
// page for the offer that /pricing's VIP card also carries. Unlike /vip
// (password-gated, lifetime price) there is no unlock step: anyone can reach
// checkout from here, and the server enforces the real rules (VIP only,
// never-paid accounts, configured coupon/plan) before any charge.

const GRAIN_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const FEATURES = [
  `${VIP_FIRST_MONTH_OFFER.credits} fresh credits every month`,
  "Unused credits roll over",
  "100% royalty free samples",
  "Cancel anytime",
];

export default function PromoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

  // Hand off to the unified /checkout page (payment-method chooser + inline
  // signup for anonymous buyers). promo=1 is only a hint — the checkout APIs
  // re-verify tier, config, and never-paid eligibility before discounting.
  const claimOffer = () => {
    trackPromoPlanSelected(VIP_FIRST_MONTH_OFFER.tierName);
    setLoading(true);
    router.push(`/checkout?tier=${VIP_FIRST_MONTH_OFFER.tierName}&promo=1`);
  };

  return (
    <div
      className={`${eurostile.variable} relative min-h-screen overflow-x-hidden bg-[#050505] text-white`}
      style={{ fontFamily: "var(--font-eurostile)" }}
    >
      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] opacity-[0.06] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_BG, backgroundSize: "180px 180px" }}
      />

      <style>{`
        @keyframes gr-deal-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(57,181,74,0.5); transform: translateX(-50%) scale(1); }
          50% { box-shadow: 0 0 34px rgba(57,181,74,0.95); transform: translateX(-50%) scale(1.05); }
        }
      `}</style>

      {/* Nav */}
      <header className="relative z-50 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM"
            className="h-6 md:h-7"
          />
        </Link>
        <Link
          href="/pricing"
          className="text-sm font-medium text-[#a1a1a1] transition hover:text-white"
        >
          All plans
        </Link>
      </header>

      {/* Demo video — leads the page */}
      <DemoVideo />

      {/* Hero */}
      <section className="relative px-5 pb-6 pt-8 text-center sm:pt-12">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[460px] w-[680px] -translate-x-1/2 rounded-full opacity-30 blur-[130px]"
          style={{
            background:
              "radial-gradient(circle, rgba(57,181,74,0.5), transparent 70%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#39b54a]/30 bg-[#39b54a]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-[#39b54a]">
            <Sparkles className="h-3.5 w-3.5" />
            Intro offer
          </p>
          <h1
            style={display}
            className="text-[clamp(2rem,5.5vw,4rem)] uppercase leading-[0.95] tracking-[-0.01em]"
          >
            <span className="text-white">Your first month,</span>{" "}
            <span
              className="text-[#39b54a]"
              style={{ textShadow: "0 0 50px rgba(0,255,136,0.4)" }}
            >
              ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
            Get the VIP plan — {VIP_FIRST_MONTH_OFFER.credits} credits of 100%
            royalty-free samples — for ${VIP_FIRST_MONTH_OFFER.firstMonthPrice}{" "}
            your first month, then ${VIP_FIRST_MONTH_OFFER.regularPrice}/mo.
            Cancel anytime.
          </p>
        </div>
      </section>

      {/* Offer card */}
      <section className="relative px-5 pb-20 pt-6">
        <div className="relative z-10 mx-auto max-w-md">
          <div className="relative flex flex-col rounded-2xl border border-[#39b54a] bg-gradient-to-b from-[#39b54a]/[0.16] to-transparent p-7 ring-1 ring-[#39b54a]/40 shadow-[0_28px_70px_-22px_rgba(0,255,136,0.7)]">
            <span
              className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#39b54a] px-5 py-1.5 text-sm font-extrabold uppercase tracking-wider text-black"
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

            <ul className="mt-5 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-[#39b54a]" />
                  <span className="text-[#bdbdbd]">{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={claimOffer}
              disabled={loading}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#39b54a] py-3.5 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_28px_rgba(0,255,136,0.4)] disabled:opacity-50"
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
              then ${VIP_FIRST_MONTH_OFFER.regularPrice}/month. Cancel anytime.
              New members only.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-[#777]">
            Want more (or fewer) credits?{" "}
            <Link href="/pricing" className="text-[#39b54a] hover:text-white">
              Compare all plans
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM"
            className="h-6 opacity-80"
          />
          <div className="flex items-center gap-6 text-sm text-[#777]">
            <Link href="/pricing" className="transition hover:text-white">
              Pricing
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

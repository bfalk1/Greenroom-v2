"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Lock,
  Check,
  Zap,
  ArrowRight,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/lib/hooks/useUser";
import { eurostile, display } from "@/lib/fonts";
import {
  PUBLIC_SUBSCRIPTION_PACKAGES,
  VIP_LIFETIME_OFFER,
} from "@/lib/stripe/publicPriceConfig";
import {
  trackVipOfferViewed,
  trackVipOfferUnlock,
  trackVipPlanSelected,
  trackVipLifetimeConfirmed,
} from "@/lib/analytics";

type Pkg = (typeof PUBLIC_SUBSCRIPTION_PACKAGES)[number];

const GRAIN_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Hides itself if /greenroom-demo.mp4 is missing or fails to load, so a broken
// player never shows while the asset is still pending.
function DemoVideo() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <section className="relative z-10 px-5 pb-6 pt-8 sm:pt-10">
      <div className="relative mx-auto max-w-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-0 rounded-[2.5rem] opacity-35 blur-[80px]"
          style={{ background: "radial-gradient(circle, rgba(57,181,74,0.45), transparent 70%)" }}
        />
        <video
          src="/greenroom-demo.mp4"
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          className="relative z-10 w-full rounded-2xl border border-white/10 bg-black shadow-[0_30px_90px_-25px_rgba(0,0,0,0.9)]"
        />
      </div>
    </section>
  );
}

export default function VipOfferPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  // Has this browser already cleared the password gate? Keeps the offer open
  // across reloads and a sign-in round-trip (the cookie lives 30 days).
  useEffect(() => {
    let active = true;
    fetch("/api/vip-offer")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const isUnlocked = Boolean(d?.unlocked);
        setUnlocked(isUnlocked);
        // Top of the VIP funnel — fired once per page load.
        trackVipOfferViewed(isUnlocked ? "unlocked" : "gate");
      })
      .catch(() => {
        // Offer-check failed → the gate UI is what renders. Still count the
        // visit: this is the funnel's denominator, and silently dropping it
        // undercounts exactly the "landed vs converted" number /vip exists
        // to answer.
        if (active) trackVipOfferViewed("gate");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Returning from a canceled Stripe checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "true") {
      toast.info("Checkout canceled — no charges were made.");
      window.history.replaceState({}, "", "/vip");
    }
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/vip-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      trackVipOfferUnlock(
        res.ok,
        res.ok ? undefined : res.status === 429 ? "rate_limited" : "wrong_password"
      );
      if (res.ok) {
        setUnlocked(true);
      } else if (res.status === 429) {
        // The per-IP limiter (10/min) — not a bad code. Saying "incorrect"
        // here makes people retype the right code into a closed door.
        toast.error("Too many attempts — wait a minute and try again.");
      } else {
        toast.error("Incorrect access code. Please try again.");
      }
    } catch {
      trackVipOfferUnlock(false, "error");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Hand off to the unified /checkout page (payment-method chooser). The
  // lifetime discount is authorized server-side from the gr_vip_offer unlock
  // cookie, so BOTH the Card and PayPal paths apply it (Stripe coupon / PayPal
  // discounted plan) — see the two checkout API routes. lifetime=1 in the URL is
  // only a hint; the server re-verifies the cookie before discounting.
  const startCheckout = (pkg: Pkg, lifetime: boolean) => {
    if (!pkg.priceId) return;
    // Don't treat an unresolved auth context as signed-out — otherwise a
    // genuinely signed-in user (e.g. one who just returned from
    // /login?redirect=/vip before the context resolved) gets bounced back to
    // login. Buttons are disabled while loading, but guard here too.
    if (userLoading) return;
    const query = lifetime
      ? "?tier=VIP&lifetime=1"
      : `?tier=${encodeURIComponent(pkg.tierName)}`;
    if (!user) {
      // New visitors create an account first. Deep-link the redirect straight
      // to the discounted checkout — NOT back to /vip, which would make them
      // re-scroll, re-click the plan, and re-accept the terms modal after
      // signup (each redone step at their highest-intent moment sheds buyers).
      // The lifetime discount doesn't depend on this hop: the server
      // authorizes it from the unlock cookie. No toast here — a full-page
      // navigation destroys it before it renders.
      window.location.href = `/signup?redirect=${encodeURIComponent(
        `/checkout${query}`
      )}`;
      return;
    }
    setLoadingPriceId(pkg.priceId);
    router.push(`/checkout${query}`);
  };

  // VIP runs through the lifetime-terms modal first; other tiers go straight to
  // checkout at their normal price.
  const handleSelect = (pkg: Pkg) => {
    // VIP selection is the lifetime path (gated behind the terms modal); other
    // tiers subscribe at normal price.
    trackVipPlanSelected(pkg.tierName, pkg.tierName === "VIP");
    if (pkg.tierName === "VIP") {
      setShowTerms(true);
    } else {
      startCheckout(pkg, false);
    }
  };

  const confirmLifetime = () => {
    setShowTerms(false);
    trackVipLifetimeConfirmed();
    const vipPkg = PUBLIC_SUBSCRIPTION_PACKAGES.find(
      (p) => p.tierName === "VIP"
    );
    if (vipPkg) startCheckout(vipPkg, true);
  };

  // ---------- Loading ----------
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <Loader2 className="h-8 w-8 animate-spin text-[#39b54a]" />
      </div>
    );
  }

  // ---------- Password gate ----------
  if (!unlocked) {
    return (
      <div
        className={`${eurostile.variable} relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 text-white`}
        style={{ fontFamily: "var(--font-eurostile)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(57,181,74,0.55), transparent 70%)",
          }}
        />
        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 text-center">
            <img
              src="/greenroom-2-logo.png"
              alt="GREENROOM"
              className="mx-auto mb-8 h-7"
            />
            <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#39b54a]/30 bg-[#39b54a]/10 text-[#39b54a]">
              <Lock className="h-6 w-6" />
            </div>
            <h1
              style={display}
              className="text-[clamp(1.8rem,5vw,2.6rem)] uppercase leading-[0.98] tracking-[-0.01em]"
            >
              Members only
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#a1a1a1]">
              An exclusive launch offer for new members. Enter your access code
              to continue.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access code"
              className="w-full rounded-xl border border-[#2a2a2a] bg-[#111] px-4 py-3.5 text-center text-lg tracking-widest text-white placeholder-[#555] outline-none transition focus:border-[#39b54a]/60 focus:ring-2 focus:ring-[#39b54a]/20"
            />
            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#39b54a] py-3.5 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_28px_rgba(0,255,136,0.4)] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Unlock offer
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#666]">
            Don&apos;t have a code?{" "}
            <Link href="/pricing" className="text-[#39b54a] hover:text-white">
              See standard pricing
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ---------- Offer ----------
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
          Standard pricing
        </Link>
      </header>

      {/* Demo video — leads the page */}
      <DemoVideo />

      {/* Hero + lifetime graphic */}
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
            New VIP offer
          </p>
          <h1
            style={display}
            className="text-[clamp(2rem,5.5vw,4rem)] uppercase leading-[0.95] tracking-[-0.01em]"
          >
            <span className="text-white">Choose your</span>{" "}
            <span
              className="text-[#39b54a]"
              style={{ textShadow: "0 0 50px rgba(0,255,136,0.4)" }}
            >
              plan
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
            Every plan includes monthly credits that roll over and 100%
            royalty-free samples.
          </p>
        </div>
      </section>

      {/* All plans */}
      <section className="relative px-5 pb-20 pt-4">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {PUBLIC_SUBSCRIPTION_PACKAGES.map((pkg) => {
            const isVip = pkg.tierName === "VIP";
            const price = isVip ? VIP_LIFETIME_OFFER.lifetimePrice : pkg.price;
            const isLoading = loadingPriceId === pkg.priceId;
            return (
              <div
                key={pkg.name}
                className={`relative flex flex-col rounded-2xl border p-7 transition-all ${
                  isVip
                    ? "z-10 border-[#39b54a] bg-gradient-to-b from-[#39b54a]/[0.16] to-transparent ring-1 ring-[#39b54a]/40 shadow-[0_28px_70px_-22px_rgba(0,255,136,0.7)] md:scale-[1.05]"
                    : "border-white/10 bg-white/[0.03] hover:border-[#39b54a]/40"
                }`}
              >
                {isVip && (
                  <span
                    className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#39b54a] px-5 py-1.5 text-sm font-extrabold uppercase tracking-wider text-black"
                    style={{ animation: "gr-deal-pulse 2.4s ease-in-out infinite" }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Lifetime deal
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <h3
                    style={display}
                    className="text-xl uppercase tracking-wide text-white"
                  >
                    {pkg.name}
                  </h3>

                  <div className="flex shrink-0 items-end gap-1.5">
                    {isVip && (
                      <span className="pb-0.5 text-sm font-semibold text-red-500 line-through decoration-red-500 decoration-2">
                        ${VIP_LIFETIME_OFFER.regularPrice}
                      </span>
                    )}
                    <span className="text-3xl font-bold leading-none text-white">
                      ${price}
                    </span>
                    <span className="pb-0.5 text-sm text-[#a1a1a1]">/mo</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                  <Zap className="h-5 w-5 text-[#39b54a]" />
                  <span className="font-semibold text-white">
                    {pkg.credits} credits
                  </span>
                  <span className="text-sm text-[#a1a1a1]">/ month</span>
                </div>

                <ul className="mt-5 flex-1 space-y-3">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 shrink-0 text-[#39b54a]" />
                      <span className="text-[#bdbdbd]">{f}</span>
                    </li>
                  ))}
                  {isVip && (
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 shrink-0 text-[#39b54a]" />
                      <span className="font-semibold text-[#39b54a]">
                        Lifetime price locked at ${VIP_LIFETIME_OFFER.lifetimePrice}/mo
                      </span>
                    </li>
                  )}
                </ul>

                <button
                  onClick={() => handleSelect(pkg)}
                  disabled={isLoading || !pkg.priceId || userLoading}
                  className={`mt-7 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold transition disabled:opacity-50 ${
                    isVip
                      ? "bg-[#39b54a] text-black hover:bg-[#2e9140]"
                      : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : !pkg.priceId ? (
                    "Unavailable"
                  ) : isVip ? (
                    "Claim lifetime price"
                  ) : (
                    "Subscribe"
                  )}
                </button>
              </div>
            );
          })}
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

      {/* Lifetime terms modal */}
      {showTerms && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#39b54a]/30 bg-[#0d0d0d] p-7">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3
              style={display}
              className="text-2xl uppercase tracking-wide text-white"
            >
              Before you continue
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#bdbdbd]">
              Your{" "}
              <span className="font-semibold text-[#39b54a]">
                ${VIP_LIFETIME_OFFER.lifetimePrice}/mo lifetime price
              </span>{" "}
              is tied to this VIP subscription. If you{" "}
              <span className="font-semibold text-white">cancel</span> or{" "}
              <span className="font-semibold text-white">change plans</span>, the
              lifetime discount is gone for good — you&apos;ll return to standard
              pricing (${VIP_LIFETIME_OFFER.regularPrice}/mo) if you resubscribe.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                onClick={confirmLifetime}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#39b54a] py-3 font-bold text-black transition hover:bg-[#2e9140]"
              >
                I understand — continue
              </button>
              <button
                onClick={() => setShowTerms(false)}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, CreditCard, Loader2, Zap } from "lucide-react";
import {
  PUBLIC_SUBSCRIPTION_PACKAGES,
  VIP_LIFETIME_OFFER,
} from "@/lib/stripe/publicPriceConfig";
import {
  CA_PROVINCES,
  canadaTaxPercent,
  taxCollectionEnabled,
} from "@/lib/tax/canadaRates";
import { useUser } from "@/lib/hooks/useUser";
import { SignupForm } from "@/components/auth/SignupForm";
import {
  trackSubscriptionCheckout,
  trackCheckoutViewed,
  trackCheckoutMethodSelected,
  trackCheckoutApiError,
} from "@/lib/analytics";
import { toast } from "sonner";

const paypalSubsEnabled =
  process.env.NEXT_PUBLIC_PAYPAL_SUBSCRIPTIONS_ENABLED === "true";

type PayMethod = "card" | "paypal";

interface CurrentSub {
  tierName: string;
  provider: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading, error: userError, refreshUser } = useUser();

  const tierName = searchParams.get("tier") ?? "";
  const pkg = PUBLIC_SUBSCRIPTION_PACKAGES.find((p) => p.tierName === tierName);

  const [sub, setSub] = useState<CurrentSub | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  // Server-computed lifetime eligibility (never-PAID rule). null = still
  // loading — the price area shows a skeleton rather than flashing the full
  // price at an eligible buyer (or promising $11.99 to an ineligible one).
  const [lifetimeEligible, setLifetimeEligible] = useState<boolean | null>(
    null
  );
  const [method, setMethod] = useState<PayMethod>("card");
  const [submitting, setSubmitting] = useState(false);
  // Last checkout API failure, shown inline — a transient toast is easy to
  // miss and leaves the page looking silently broken on retry-proof errors.
  const [apiError, setApiError] = useState<string | null>(null);
  // The subscription/eligibility fetch failed — block checkout and offer a
  // reload rather than proceeding on unknown plan state.
  const [subLoadError, setSubLoadError] = useState(false);
  // Billing region for the PayPal tax path (Stripe collects its own address).
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");

  // Unknown tier in the URL — nothing to check out.
  useEffect(() => {
    if (!pkg) router.replace("/pricing");
  }, [pkg, router]);

  // Signed-out visitor: /checkout is public now, and the payment column
  // renders the inline signup step instead. NOT the userError case — that's an
  // authenticated session whose /api/user/me load failed (handled below).
  const anonymous = !user && !userLoading && !userError;

  // checkout_viewed fires once, after auth state and (for signed-in lifetime
  // buyers) the eligibility verdict resolve — so the event carries whether the
  // buyer saw $11.99 or the ineligible fallback. Anonymous visitors have no
  // verdict (the eligibility API needs a session): fires with null.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current || !pkg || userLoading) return;
    const lt = searchParams.get("lifetime") === "1" && pkg.tierName === "VIP";
    const anon = !user && !userError;
    if (lt && !anon && lifetimeEligible === null) return;
    viewTracked.current = true;
    trackCheckoutViewed({
      tier: pkg.tierName,
      lifetime: lt,
      lifetimeEligible: lt ? lifetimeEligible : null,
      signedIn: !anon,
    });
  }, [pkg, searchParams, lifetimeEligible, user, userLoading, userError]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/user/subscription")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        setSub(data?.subscription ?? null);
        setLifetimeEligible(
          typeof data?.lifetimeEligible === "boolean"
            ? data.lifetimeEligible
            : false
        );
        setSubLoadError(false);
      })
      // A failed fetch must NOT resolve to "ineligible" (silently showing an
      // eligible buyer full price) or leave the skeleton stuck forever —
      // surface it as a retryable error instead.
      .catch(() => setSubLoadError(true))
      .finally(() => setSubLoaded(true));
  }, [user]);

  if (!pkg) return null;

  // Authenticated session whose /api/user/me load failed (UserContext error
  // contract: user stays null, error=true). Without this branch the page
  // renders normally but Continue stays disabled forever (subLoaded is only
  // set by the user-gated fetch) — surface the failure with a retry instead.
  if (userError && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white font-semibold mb-2">
            We couldn&apos;t load your account.
          </p>
          <p className="text-[#a1a1a1] text-sm mb-6">
            Nothing has been charged. Please try again.
          </p>
          <Button
            onClick={() => refreshUser()}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const hasActiveSub =
    sub != null && (sub.status === "ACTIVE" || sub.status === "PAST_DUE");
  const samePlan = hasActiveSub && sub!.tierName === pkg.tierName;

  // Lifetime VIP offer (arrived via /vip → /checkout?tier=VIP&lifetime=1). The
  // discount is authorized server-side from the gr_vip_offer unlock cookie —
  // here we just show the discounted price and pass the flag through.
  // Eligibility is the server's never-PAID verdict from /api/user/subscription
  // (same rule the checkout APIs enforce via isLifetimeEligible), NOT the
  // subscription_status flag — that flag is set by beta comps and has drifted
  // stale before, which wrongly showed full price to eligible buyers. While
  // the verdict is loading (null) the price area renders a skeleton.
  // Anonymous visitors can't be checked (the API needs a session) but a
  // brand-new account is never-paid by definition, so show the lifetime price;
  // signing IN to an existing account re-resolves the real verdict, and the
  // checkout APIs refuse (not full-charge) an unauthorized lifetime request.
  const isLifetime =
    searchParams.get("lifetime") === "1" && pkg.tierName === "VIP";
  const lifetimeVerdict = anonymous ? true : lifetimeEligible;
  const applyLifetime = isLifetime && lifetimeVerdict === true;
  const lifetimeUndetermined = isLifetime && lifetimeVerdict === null;
  const price = applyLifetime ? VIP_LIFETIME_OFFER.lifetimePrice : pkg.price;

  // Canonical self-URL, threaded through every auth round trip out of the
  // inline signup step (Google OAuth, email confirmation, sign-in cross-link)
  // so the buyer lands back here with tier/lifetime intact.
  const selfPath = `/checkout?tier=${encodeURIComponent(pkg.tierName)}${
    isLifetime ? "&lifetime=1" : ""
  }`;

  // A live subscription pins the payment method to its own provider: PayPal
  // subs change plans via revise, Stripe subs via a new checkout session —
  // crossing providers would double-bill (the API routes reject it anyway).
  const isPaypalSwitch = hasActiveSub && sub!.provider === "paypal";
  const isStripeChange = hasActiveSub && sub!.provider === "stripe";
  const cardAvailable = !isPaypalSwitch && Boolean(pkg.priceId);
  const paypalAvailable = paypalSubsEnabled && !isStripeChange;

  // Besides provider pinning, fall back to PayPal when card isn't available
  // (Stripe price ID unset): the default method state is "card", and leaving
  // it effective would POST an empty priceId to the Stripe checkout API.
  const effectiveMethod: PayMethod = isPaypalSwitch
    ? "paypal"
    : isStripeChange
      ? "card"
      : !cardAvailable && paypalAvailable
        ? "paypal"
        : method;

  // Region is collected only for a NEW PayPal subscription: PayPal can't derive
  // location tax itself and needs the rate at create-time. Card tax is computed
  // by Stripe on its own page; a plan-change (revise) keeps the tax fixed at the
  // original subscription's creation. Inert unless tax collection is enabled.
  const showTaxRegion =
    taxCollectionEnabled() &&
    effectiveMethod === "paypal" &&
    !isPaypalSwitch &&
    !samePlan;
  const taxPercent = showTaxRegion ? canadaTaxPercent(country, region) : 0;
  const taxAmount = (price * taxPercent) / 100;
  const taxRegionIncomplete =
    showTaxRegion && (!country || (country === "CA" && !region));

  const handleContinue = async () => {
    if (!user) {
      toast.error("Please sign in to subscribe.");
      return;
    }

    if (taxRegionIncomplete) {
      toast.error(
        country === "CA"
          ? "Please select your province so we can apply the correct tax."
          : "Please select your billing country."
      );
      return;
    }

    setSubmitting(true);
    setApiError(null);
    let endpoint = "";
    try {
      let body: Record<string, string | boolean>;

      if (effectiveMethod === "card") {
        endpoint = "/api/subscription/checkout";
        // lifetime is only honored server-side when the unlock cookie is valid,
        // the tier is VIP, and the user has no active sub — the flag alone never
        // discounts.
        body = { priceId: pkg.priceId, lifetime: applyLifetime };
      } else if (isPaypalSwitch) {
        endpoint = "/api/subscription/revise-paypal";
        body = { tierName: pkg.tierName };
      } else {
        endpoint = "/api/subscription/checkout-paypal";
        // Server recomputes the rate from these — never trusts a client amount.
        body = {
          tierName: pkg.tierName,
          country,
          region,
          lifetime: applyLifetime,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message: string =
          typeof data?.error === "string" && data.error
            ? data.error
            : "Failed to start checkout. Please try again.";
        // Payment failures were previously invisible in analytics — the
        // expired-coupon outage lived only in Stripe's request logs.
        trackCheckoutApiError({ endpoint, status: res.status, message });
        setApiError(message);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      if (data.url) {
        trackSubscriptionCheckout(
          pkg.name,
          effectiveMethod === "card" ? pkg.priceId : `paypal-${pkg.tierName}`,
          { tier: pkg.tierName, lifetime: applyLifetime, method: effectiveMethod }
        );
        window.location.href = data.url;
        return;
      }

      // 2xx without a redirect URL — never leave an eternal spinner.
      trackCheckoutApiError({
        endpoint,
        status: res.status,
        message: "No redirect URL in checkout response",
      });
      setApiError(
        "Something went wrong starting checkout — nothing was charged. Please try again."
      );
      setSubmitting(false);
    } catch (error) {
      console.error("Checkout error:", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to start checkout. Please try again.";
      trackCheckoutApiError({ endpoint, status: 0, message });
      setApiError(message);
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* The lifetime flow's escape hatch goes back to the offer, not to
            full-price /pricing — leaking a discounted buyer into the standard
            grid quietly costs them the deal. */}
        <Link
          href={isLifetime ? "/vip" : "/pricing"}
          className="inline-flex items-center gap-2 text-sm text-[#a1a1a1] hover:text-white transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          {isLifetime ? "Back to VIP offer" : "All plans"}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 items-start">
          {/* ——— Inline signup (signed out) / payment method ——— */}
          <div>
            {anonymous ? (
              // Signed-out buyers create their account right here — the order
              // summary stays alongside so the tier they picked never leaves
              // the screen. With an immediate session the column re-renders
              // into the payment chooser in place; the email-confirmation and
              // Google paths round-trip through /callback back to selfPath.
              <SignupForm
                redirect={selfPath}
                source="checkout"
                onSession={async () => {
                  await refreshUser();
                }}
                header={
                  <>
                    <h1 className="text-3xl font-bold text-white mb-2">
                      Create your account
                    </h1>
                    <p className="text-[#a1a1a1] mb-8">
                      Your {pkg.name} plan is saved — set up your account, then
                      choose how to pay.
                    </p>
                  </>
                }
              />
            ) : (
              <>
                <h1 className="text-3xl font-bold text-white mb-2">
                  {samePlan
                    ? "Your current plan"
                    : hasActiveSub
                      ? "Change your plan"
                      : "Complete your subscription"}
                </h1>
                <p className="text-[#a1a1a1] mb-8">
                  {samePlan
                    ? "You're already subscribed to this plan."
                    : hasActiveSub
                      ? `Switching from ${sub!.tierName} — your new plan starts next billing cycle.`
                      : "Choose how you'd like to pay. You can cancel anytime."}
                </p>

                {samePlan ? (
                  <Button
                    onClick={() => router.push("/account")}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a] font-semibold px-6"
                  >
                    Manage subscription
                  </Button>
                ) : (
                  <>
                    <div className="space-y-3 mb-8" role="radiogroup" aria-label="Payment method">
                      {cardAvailable && (
                        <MethodCard
                          selected={effectiveMethod === "card"}
                          onSelect={() => {
                            setMethod("card");
                            trackCheckoutMethodSelected("card");
                          }}
                          locked={isStripeChange}
                          title="Card"
                          subtitle="Visa, Mastercard, Amex and more — via Stripe"
                          icon={<CreditCard className="w-5 h-5" />}
                        />
                      )}
                      {paypalAvailable && (
                        <MethodCard
                          selected={effectiveMethod === "paypal"}
                          onSelect={() => {
                            setMethod("paypal");
                            trackCheckoutMethodSelected("paypal");
                          }}
                          locked={isPaypalSwitch}
                          title="PayPal"
                          subtitle={
                            isPaypalSwitch
                              ? "Your subscription is billed through PayPal"
                              : "Pay with your PayPal account"
                          }
                          icon={<PaypalMark />}
                        />
                      )}
                      {!cardAvailable && !paypalAvailable && (
                        // Previously a silent dead end: no method cards, a
                        // permanently disabled button, and no explanation.
                        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-900/40 text-amber-200 text-sm">
                          Payments are temporarily unavailable — nothing is wrong
                          with your account, and nothing has been charged. Please
                          try again shortly or contact support@greenroom.fm.
                        </div>
                      )}
                    </div>

                    {showTaxRegion && (
                      <div className="mb-8">
                        <label className="block text-sm font-medium text-white mb-1">
                          Billing location
                        </label>
                        <p className="text-xs text-[#6a6a6a] mb-3">
                          PayPal needs your region to apply the correct tax.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <select
                            aria-label="Country"
                            value={country}
                            onChange={(e) => {
                              setCountry(e.target.value);
                              setRegion("");
                            }}
                            className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] text-white px-4 py-3 text-sm focus:border-[#39b54a] focus:outline-none"
                          >
                            <option value="">Select country…</option>
                            <option value="US">United States</option>
                            <option value="CA">Canada</option>
                            <option value="OTHER">Other</option>
                          </select>
                          {country === "CA" && (
                            <select
                              aria-label="Province"
                              value={region}
                              onChange={(e) => setRegion(e.target.value)}
                              className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] text-white px-4 py-3 text-sm focus:border-[#39b54a] focus:outline-none"
                            >
                              <option value="">Select province…</option>
                              {CA_PROVINCES.map((p) => (
                                <option key={p.code} value={p.code}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}

                    {subLoadError && (
                      <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-900/40 text-amber-200 text-sm flex items-center justify-between gap-3">
                        <span>
                          We couldn&apos;t confirm your plan details — nothing has
                          been charged.
                        </span>
                        <button
                          onClick={() => window.location.reload()}
                          className="shrink-0 underline font-semibold hover:text-white"
                        >
                          Reload
                        </button>
                      </div>
                    )}

                    {apiError && (
                      <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/30 text-red-400 text-sm">
                        {apiError}
                      </div>
                    )}

                    <Button
                      onClick={handleContinue}
                      disabled={
                        submitting ||
                        userLoading ||
                        !subLoaded ||
                        // Plan/eligibility state unknown (fetch failed) — never
                        // let a buyer continue blind.
                        subLoadError ||
                        // Lifetime flow with the eligibility verdict still unknown:
                        // the summary is a skeleton and the charge could silently
                        // be full price.
                        lifetimeUndetermined ||
                        taxRegionIncomplete ||
                        // No payable method at all (no Stripe price ID and PayPal
                        // subs disabled) — reachable by direct URL even though
                        // /pricing disables its button in this config.
                        (!cardAvailable && !paypalAvailable)
                      }
                      className="w-full py-6 text-base font-semibold bg-[#39b54a] text-black hover:bg-[#2e9140]"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Redirecting...
                        </>
                      ) : hasActiveSub ? (
                        `Switch to ${pkg.name}`
                      ) : taxPercent > 0 ? (
                        `Continue — $${(price + taxAmount).toFixed(2)}/month`
                      ) : (
                        `Continue — $${price}/month`
                      )}
                    </Button>

                    <p className="text-xs text-[#6a6a6a] mt-4 text-center">
                      You&apos;ll confirm on {effectiveMethod === "card" ? "Stripe" : "PayPal"}&apos;s
                      secure page before anything is charged. Renews monthly, cancel
                      anytime from your account.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {/* ——— Ticket-stub order summary ——— */}
          <div className="relative">
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
              {/* Stub header */}
              <div className="px-6 pt-6 pb-5">
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-[#6a6a6a] uppercase mb-5">
                  <span>Greenroom</span>
                  <span>Monthly Pass</span>
                </div>
                <h2 className="text-2xl font-bold text-white">{pkg.name}</h2>
                {lifetimeUndetermined ? (
                  // Eligibility still loading: a skeleton beats flashing the
                  // full price at an eligible buyer for a second.
                  <div className="mt-2 mb-5 h-10 w-40 rounded-lg bg-[#2a2a2a] animate-pulse" />
                ) : (
                  <div className="flex items-baseline gap-2 mt-1 mb-5">
                    {applyLifetime && (
                      <span className="text-xl font-semibold text-[#6a6a6a] line-through">
                        ${VIP_LIFETIME_OFFER.regularPrice}
                      </span>
                    )}
                    <span className="text-4xl font-bold text-[#39b54a]">
                      ${price}
                    </span>
                    <span className="text-[#a1a1a1]">/month USD</span>
                  </div>
                )}
                {applyLifetime && (
                  <p className="-mt-3 mb-5 text-xs font-semibold uppercase tracking-wider text-[#39b54a]">
                    Lifetime price · locked forever
                  </p>
                )}
                {isLifetime && !applyLifetime && !lifetimeUndetermined && (
                  <p className="-mt-3 mb-5 text-xs text-[#a1a1a1]">
                    The $11.99 lifetime price is for members without a prior
                    paid subscription, so this shows your standard price. Think
                    that&apos;s a mistake? Contact support@greenroom.fm before
                    subscribing.
                  </p>
                )}
                <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#39b54a]" />
                  <span className="text-white text-sm font-semibold">
                    {pkg.credits} credits every month
                  </span>
                </div>
              </div>

              {/* Perforation */}
              <div className="relative flex items-center px-2">
                <span className="absolute -left-3 w-6 h-6 rounded-full bg-[#101010] border border-[#2a2a2a]" />
                <span className="flex-1 border-t border-dashed border-[#3a3a3a]" />
                <span className="absolute -right-3 w-6 h-6 rounded-full bg-[#101010] border border-[#2a2a2a]" />
              </div>

              {/* Stub body */}
              <div className="px-6 pt-5 pb-6">
                <ul className="space-y-3 mb-6">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-[#39b54a] shrink-0" />
                      <span className="text-sm text-[#a1a1a1]">{feature}</span>
                    </li>
                  ))}
                </ul>
                {showTaxRegion && (
                  <div className="mb-6 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between text-[#a1a1a1]">
                      <span>Subtotal</span>
                      <span>${price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#a1a1a1]">
                      <span>Tax{region ? ` · ${region}` : ""}</span>
                      <span>{country ? `$${taxAmount.toFixed(2)}` : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-white font-semibold pt-2 border-t border-[#2a2a2a]">
                      <span>Total</span>
                      <span>${(price + taxAmount).toFixed(2)}/mo</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] text-[#6a6a6a] uppercase">
                  <span>Admit One</span>
                  <span>${(price / pkg.credits).toFixed(4)}/credit</span>
                </div>
                {/* Barcode */}
                <div
                  aria-hidden
                  className="mt-3 h-8 rounded-sm opacity-40"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, #a1a1a1 0px, #a1a1a1 2px, transparent 2px, transparent 5px, #a1a1a1 5px, #a1a1a1 6px, transparent 6px, transparent 11px)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodCard({
  selected,
  onSelect,
  locked,
  title,
  subtitle,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  locked: boolean;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={locked && !selected}
      className={`w-full flex items-center gap-4 rounded-xl border p-5 text-left transition-all ${
        selected
          ? "border-[#39b54a] bg-[#39b54a]/5"
          : "border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#39b54a]/40"
      }`}
    >
      <span
        className={`flex w-10 h-10 items-center justify-center rounded-lg shrink-0 ${
          selected ? "bg-[#39b54a] text-black" : "bg-[#0a0a0a] text-[#a1a1a1]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-white font-semibold">{title}</span>
        <span className="block text-sm text-[#a1a1a1]">{subtitle}</span>
      </span>
      <span
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
          selected ? "border-[#39b54a]" : "border-[#3a3a3a]"
        }`}
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full bg-[#39b54a]" />}
      </span>
    </button>
  );
}

function PaypalMark() {
  // Simplified PayPal double-P mark, monochrome to match the method icons.
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
      <path d="M7.1 4h6.2c2.9 0 4.6 1.5 4.3 4.1-.4 3.2-2.5 4.9-5.6 4.9H9.9l-.8 4.6H6L7.1 4z" opacity=".55" />
      <path d="M9.3 6.8h5.4c2.5 0 4-1.3 3.7 1.5-.3 2.8-2.2 4.3-4.9 4.3h-1.8l-.7 4.4H8.2l1.1-10.2z" />
    </svg>
  );
}

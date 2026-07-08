"use client";

import React, { useState, useEffect, Suspense } from "react";
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
import { trackSubscriptionCheckout } from "@/lib/analytics";
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
  const [method, setMethod] = useState<PayMethod>("card");
  const [submitting, setSubmitting] = useState(false);
  // Billing region for the PayPal tax path (Stripe collects its own address).
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");

  // Unknown tier in the URL — nothing to check out.
  useEffect(() => {
    if (!pkg) router.replace("/pricing");
  }, [pkg, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/user/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSub(data?.subscription ?? null))
      .catch(() => {})
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
  // applyLifetime gates on "NEW account": the offer is for users who aren't
  // subscribed AND have never subscribed. Anyone with subscription history sees
  // normal pricing and sends no lifetime flag (otherwise the summary would
  // promise $11.99 while the server correctly refuses / bills full price). The
  // server routes enforce the same rule authoritatively; user.subscription_status
  // is "none" only for an account that has never subscribed.
  const isNewAccount =
    user != null &&
    (user.subscription_status == null || user.subscription_status === "none");
  const isLifetime =
    searchParams.get("lifetime") === "1" && pkg.tierName === "VIP";
  const applyLifetime = isLifetime && isNewAccount;
  const price = applyLifetime ? VIP_LIFETIME_OFFER.lifetimePrice : pkg.price;

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
    try {
      let endpoint: string;
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      if (data.url) {
        trackSubscriptionCheckout(
          pkg.name,
          effectiveMethod === "card" ? pkg.priceId : `paypal-${pkg.tierName}`
        );
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error && error.message !== "Failed to start checkout"
          ? error.message
          : "Failed to start checkout. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1a1] hover:text-white transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          All plans
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 items-start">
          {/* ——— Payment method ——— */}
          <div>
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
                      onSelect={() => setMethod("card")}
                      locked={isStripeChange}
                      title="Card"
                      subtitle="Visa, Mastercard, Amex and more — via Stripe"
                      icon={<CreditCard className="w-5 h-5" />}
                    />
                  )}
                  {paypalAvailable && (
                    <MethodCard
                      selected={effectiveMethod === "paypal"}
                      onSelect={() => setMethod("paypal")}
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

                <Button
                  onClick={handleContinue}
                  disabled={
                    submitting ||
                    userLoading ||
                    !subLoaded ||
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
                <div className="flex items-baseline gap-2 mt-1 mb-5">
                  {applyLifetime && (
                    <span className="text-xl font-semibold text-[#6a6a6a] line-through">
                      ${VIP_LIFETIME_OFFER.regularPrice}
                    </span>
                  )}
                  <span className="text-4xl font-bold text-[#39b54a]">
                    ${price}
                  </span>
                  <span className="text-[#a1a1a1]">/month</span>
                </div>
                {applyLifetime && (
                  <p className="-mt-3 mb-5 text-xs font-semibold uppercase tracking-wider text-[#39b54a]">
                    Lifetime price · locked forever
                  </p>
                )}
                {isLifetime && !applyLifetime && (
                  <p className="-mt-3 mb-5 text-xs text-[#a1a1a1]">
                    The lifetime price is for new members only — it applies to
                    your first Greenroom subscription.
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

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Zap, Loader2 } from "lucide-react";
import { PUBLIC_SUBSCRIPTION_PACKAGES } from "@/lib/stripe/publicPriceConfig";
import { useUser } from "@/lib/hooks/useUser";
import { SignupForm } from "@/components/auth/SignupForm";
import { trackPaywallViewed, trackPricingPlanSelected } from "@/lib/analytics";
import { toast } from "sonner";

// PayPal subscriptions are gated separately from credit packs so packs-only
// configs (no billing plans created) don't render buttons that 503.
// NEXT_PUBLIC_* vars are inlined at build time (redeploy after changing).
const paypalSubsEnabled =
  process.env.NEXT_PUBLIC_PAYPAL_SUBSCRIPTIONS_ENABLED === "true";

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  // Which provider owns the user's current subscription (null = none) —
  // decides whether PayPal buttons subscribe, switch plans, or hide.
  const [subProvider, setSubProvider] = useState<string | null>(null);
  const { user, loading: userLoading, error: userError, refreshUser } = useUser();
  const searchParams = useSearchParams();

  const isWelcome = searchParams.get("welcome") === "true";

  // Track paywall view — signed-in users only. /pricing is public now, so
  // anonymous marketing traffic would otherwise inflate paywall_viewed and
  // skew the activations/paywall-views conversion metric.
  useEffect(() => {
    if (!user) return;
    const redirectFrom = searchParams.get("redirect") || undefined;
    trackPaywallViewed(redirectFrom);
  }, [searchParams, user]);

  // Handle success/canceled URL params
  useEffect(() => {
    // Legacy success/pending params (old Stripe success_url, stale links):
    // forward to /checkout/complete, which VERIFIES the subscription before
    // celebrating. The old toast here announced "credits ready" purely from
    // the URL param — including to buyers whose webhook grant had failed.
    // The authoritative subscription_activated event now fires server-side
    // from the grant itself, so nothing is tracked here.
    if (
      searchParams.get("success") === "true" ||
      searchParams.get("paypal_pending") === "true"
    ) {
      window.location.replace(
        searchParams.get("paypal_pending") === "true"
          ? "/checkout/complete?status=pending"
          : "/checkout/complete"
      );
      return;
    }
    if (searchParams.get("canceled") === "true") {
      toast.info("Checkout canceled. No charges were made.");
      window.history.replaceState({}, "", "/pricing");
    }
    if (searchParams.get("paypal_revised") === "true") {
      toast.success(
        "Plan change confirmed — your new plan and credits start next billing cycle."
      );
      window.history.replaceState({}, "", "/pricing");
    }
    if (searchParams.get("paypal_error") === "true") {
      toast.error(
        "Something went wrong completing your PayPal subscription. If you approved a payment, contact support."
      );
      window.history.replaceState({}, "", "/pricing");
    }
  }, [searchParams]);

  // Load which provider owns the active subscription (for PayPal buttons).
  useEffect(() => {
    if (!user) return;
    fetch("/api/user/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSubProvider(data?.subscription?.provider ?? null))
      .catch(() => {});
  }, [user]);

  const handleManageSubscription = async () => {
    // PayPal subs have no Stripe portal — their cancel/change actions live
    // on the account page.
    if (subProvider === "paypal") {
      window.location.href = "/account";
      return;
    }

    setPortalLoading(true);
    try {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error opening portal:", error);
      toast.error("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const hasActiveSub =
    user?.subscription_status === "active" ||
    user?.subscription_status === "past_due";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Welcome Banner for New Signups */}
        {isWelcome && !hasActiveSub && (
          <div className="max-w-2xl mx-auto mb-12 bg-gradient-to-r from-[#39b54a]/20 to-[#1a1a1a] border border-[#39b54a]/30 rounded-xl p-6 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to GREENROOM! 🎉</h2>
            <p className="text-[#a1a1a1]">
              Choose a plan below to unlock unlimited access to thousands of royalty-free samples.
            </p>
            <p className="text-sm text-[#a1a1a1] mt-3">
              Not ready yet?{" "}
              <Link href="/explore" className="text-[#39b54a] hover:underline">
                Browse the catalog first
              </Link>
            </p>
          </div>
        )}

        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            {isWelcome && !hasActiveSub ? "Choose Your Plan" : "Simple Pricing"}
          </h1>
          <p className="text-xl text-[#a1a1a1]">
            Choose your monthly subscription and get fresh credits every month
          </p>
        </div>

        {/* Active Subscription Banner */}
        {hasActiveSub && (
          <div className="max-w-2xl mx-auto mb-12 bg-[#1a1a1a] border border-[#39b54a]/30 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-[#39b54a]" />
              <h3 className="text-lg font-semibold text-white">
                Active Subscription
              </h3>
            </div>
            <p className="text-[#a1a1a1] mb-4">
              You&apos;re currently subscribed. Manage your plan, update payment
              methods, or cancel anytime.
            </p>
            <Button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold"
            >
              {portalLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                "Manage Subscription"
              )}
            </Button>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PUBLIC_SUBSCRIPTION_PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className={`relative rounded-2xl border transition-all ${
                pkg.highlighted
                  ? "bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-[#39b54a] shadow-lg shadow-[#39b54a]/20 scale-105"
                  : "bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#39b54a]/50"
              }`}
            >
              {pkg.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#39b54a] text-black text-sm font-semibold px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="p-8">
                {/* Package Name */}
                <h3 className="text-2xl font-bold text-white mb-2">
                  {pkg.name}
                </h3>
                <p className="text-sm text-[#39b54a] mb-4">
                  Monthly Subscription
                </p>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-5xl font-bold text-white">
                    ${pkg.price}
                  </span>
                  <span className="text-[#a1a1a1]">/month</span>
                </div>

                {/* Credits */}
                <div className="bg-[#0a0a0a] rounded-lg p-4 mb-6 border border-[#2a2a2a]">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[#39b54a]" />
                    <span className="text-white font-semibold">
                      {pkg.credits} Credits
                    </span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[#39b54a]" />
                      <span className="text-[#a1a1a1]">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Payment method is chosen on /checkout — one button here.
                    /checkout is public: anonymous visitors sign up inline
                    there with the tier they picked staying on screen, so
                    everyone goes straight to /checkout?tier=X (the old
                    signed-out bounce to /signup dropped the tier choice and
                    was a major funnel exit). */}
                <Button
                  onClick={() => {
                    trackPricingPlanSelected(pkg.tierName, {
                      signedIn: Boolean(user || userError),
                      destination: "checkout",
                    });
                    router.push(`/checkout?tier=${pkg.tierName}`);
                  }}
                  disabled={userLoading || (!pkg.priceId && !paypalSubsEnabled)}
                  className={`w-full py-3 font-semibold ${
                    pkg.highlighted
                      ? "bg-[#39b54a] text-black hover:bg-[#2e9140]"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  }`}
                >
                  {!pkg.priceId && !paypalSubsEnabled
                    ? "Unavailable"
                    : !user && !userError
                      ? "Get Started"
                      : hasActiveSub
                        ? "Change Plan"
                        : "Subscribe Now"}
                </Button>

                <p className="text-center text-xs text-[#a1a1a1] mt-4">
                  Billed monthly
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Inline signup for signed-out visitors who aren't ready to pick a
            plan yet (plan buttons already carry the tier into /checkout's own
            signup step). On an immediate session the page continues in place:
            the user context refreshes and the URL flips to ?welcome=true so
            the welcome banner + "Choose Your Plan" heading take over. The
            email-confirmation and Google paths ride the same redirect through
            /callback. */}
        {!user && !userLoading && !userError && (
          <div className="mt-20 flex justify-center">
            <SignupForm
              redirect="/pricing?welcome=true"
              source="pricing"
              onSession={async () => {
                await refreshUser();
                router.replace("/pricing?welcome=true");
              }}
              header={
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Not ready to pick?
                  </h2>
                  <p className="text-[#a1a1a1]">
                    Create your free account now and choose a plan whenever
                    you&apos;re ready.
                  </p>
                </div>
              }
            />
          </div>
        )}

        {/* FAQ Section */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">
            FAQ
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                How do credits work?
              </h3>
              <p className="text-[#a1a1a1]">
                Each sample has a credit price. When you purchase a sample, it
                deducts credits from your account. You can download that sample
                unlimited times.
              </p>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                How does billing work?
              </h3>
              <p className="text-[#a1a1a1]">
                You&apos;ll be charged monthly and receive fresh credits at the
                start of each billing cycle. Unused credits roll over to the
                next month.
              </p>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Can I cancel anytime?
              </h3>
              <p className="text-[#a1a1a1]">
                Yes, you can cancel your subscription anytime from your account
                settings. Your credits remain available until the end of your
                billing period.
              </p>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                What payment methods do you accept?
              </h3>
              <p className="text-[#a1a1a1]">
                We accept all major credit cards via Stripe, and PayPal — for
                both subscriptions and credit packs. Payments are secure and
                processed instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

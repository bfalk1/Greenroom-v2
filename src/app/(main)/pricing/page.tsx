"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Zap, Loader2 } from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

const packages = [
  {
    name: "General Admission",
    tierName: "GA",
    credits: 100,
    price: 10.99,
    priceId: "price_1Sx90A5k6Fwn7Cbz1uGYPTpZ",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: false,
  },
  {
    name: "VIP",
    tierName: "VIP",
    credits: 200,
    price: 18.99,
    priceId: "price_1Sx90Q5k6Fwn7CbzwN0qSyDO",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: true,
  },
  {
    name: "All Access",
    tierName: "AA",
    credits: 500,
    price: 34.99,
    priceId: "price_1Sx90e5k6Fwn7CbzYPkArchS",
    features: [
      "Unused credits roll over",
      "Cancel anytime",
      "100% royalty free samples",
    ],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const [loading, setLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const { user, loading: userLoading } = useUser();
  const searchParams = useSearchParams();

  // Handle success/canceled URL params
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Subscription activated! Your credits are ready to use.");
      // Clean URL
      window.history.replaceState({}, "", "/pricing");
    }
    if (searchParams.get("canceled") === "true") {
      toast.info("Checkout canceled. No charges were made.");
      window.history.replaceState({}, "", "/pricing");
    }
  }, [searchParams]);

  const handlePurchase = async (priceId: string) => {
    if (!user) {
      toast.error("Please sign in to subscribe.");
      return;
    }

    setLoading(priceId);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
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
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">Simple Pricing</h1>
          <p className="text-xl text-[#a1a1a1]">
            Choose your monthly subscription and get fresh credits every month
          </p>
        </div>

        {/* Active Subscription Banner */}
        {hasActiveSub && (
          <div className="max-w-2xl mx-auto mb-12 bg-[#1a1a1a] border border-[#00FF88]/30 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-[#00FF88]" />
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
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold"
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
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className={`relative rounded-2xl border transition-all ${
                pkg.highlighted
                  ? "bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-[#00FF88] shadow-lg shadow-[#00FF88]/20 scale-105"
                  : "bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#00FF88]/50"
              }`}
            >
              {pkg.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#00FF88] text-black text-sm font-semibold px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="p-8">
                {/* Package Name */}
                <h3 className="text-2xl font-bold text-white mb-2">
                  {pkg.name}
                </h3>
                <p className="text-sm text-[#00FF88] mb-4">
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
                    <Zap className="w-5 h-5 text-[#00FF88]" />
                    <span className="text-white font-semibold">
                      {pkg.credits} Credits
                    </span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-8">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-[#00FF88]" />
                      <span className="text-[#a1a1a1]">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  onClick={() => handlePurchase(pkg.priceId)}
                  disabled={loading !== null || userLoading}
                  className={`w-full py-3 font-semibold ${
                    pkg.highlighted
                      ? "bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  }`}
                >
                  {loading === pkg.priceId ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : hasActiveSub ? (
                    "Change Plan"
                  ) : (
                    "Subscribe Now"
                  )}
                </Button>

                {/* Price per credit */}
                <p className="text-center text-xs text-[#a1a1a1] mt-4">
                  ${(pkg.price / pkg.credits).toFixed(4)} per credit • Billed
                  monthly
                </p>
              </div>
            </div>
          ))}
        </div>

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
                We accept all major credit cards via Stripe. Payments are secure
                and processed instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

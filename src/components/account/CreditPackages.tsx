"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Zap, AlertCircle } from "lucide-react";

const PACKAGES = [
  {
    name: "General Admission",
    credits: 100,
    price: 10.99,
    priceId: "price_1Sv50uIWJCIyCVNS2v5Vrdl1",
    description: "Perfect for trying out samples",
    features: ["100 Credits", "Download rights", "Use anytime"],
    highlighted: false,
  },
  {
    name: "VIP",
    credits: 200,
    price: 18.99,
    priceId: "price_1Sv50uIWJCIyCVNSnYOFdlgc",
    description: "Best value for producers",
    features: ["200 Credits", "Unlimited downloads", "Best value"],
    highlighted: true,
  },
  {
    name: "All Access",
    credits: 500,
    price: 34.99,
    priceId: "price_1Sv50uIWJCIyCVNSS8KxUBnd",
    description: "Maximum value package",
    features: ["500 Credits", "Priority support", "Best savings"],
    highlighted: false,
  },
];

export function CreditPackages() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async (pkg: (typeof PACKAGES)[0]) => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with Stripe checkout session creation
      console.log("Purchase:", pkg.priceId);
      alert("Checkout coming soon!");
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Failed to process checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-2">Buy Credits</h2>
      <p className="text-[#a1a1a1] text-sm mb-6">
        Choose a package that fits your needs. Credits never expire.
      </p>

      {error && (
        <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-4 mb-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-medium">Error</p>
            <p className="text-red-200/70 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PACKAGES.map((pkg) => (
          <div
            key={pkg.name}
            className={`rounded-lg border p-6 transition flex flex-col ${
              pkg.highlighted
                ? "bg-gradient-to-b from-[#00FF88]/10 to-[#00cc6a]/5 border-[#00FF88]/30"
                : "bg-[#1a1a1a] border-[#2a2a2a]"
            }`}
          >
            {pkg.highlighted && (
              <div className="bg-[#00FF88] text-black text-xs font-bold px-3 py-1 rounded-full w-fit mb-4">
                MOST POPULAR
              </div>
            )}

            <h3 className="text-xl font-semibold text-white mb-2">
              {pkg.name}
            </h3>
            <p className="text-[#a1a1a1] text-sm mb-4">{pkg.description}</p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-bold text-white">
                ${pkg.price}
              </span>
              <span className="text-[#a1a1a1] text-sm">/one-time</span>
            </div>

            <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-[#0a0a0a]/50">
              <Zap className="w-5 h-5 text-[#00FF88]" />
              <span className="text-lg font-semibold text-white">
                {pkg.credits} Credits
              </span>
            </div>

            <ul className="space-y-2 mb-6 flex-1">
              {pkg.features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-2 items-start text-sm text-[#a1a1a1]"
                >
                  <Check className="w-4 h-4 text-[#00FF88] mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => handlePurchase(pkg)}
              disabled={loading}
              className={`w-full h-10 font-semibold transition ${
                pkg.highlighted
                  ? "bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                  : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
              }`}
            >
              {loading ? "Processing..." : "Buy Now"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

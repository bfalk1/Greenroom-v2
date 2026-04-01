"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";
import { PUBLIC_CREDIT_PACKAGES } from "@/lib/stripe/publicPriceConfig";
import { toast } from "sonner";

export function CreditPackages() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleBuy = async (priceId: string) => {
    setLoading(priceId);
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Credit purchase error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Buy Credits</h2>
      <p className="text-[#a1a1a1] text-sm mb-6">
        Need more credits? Top up anytime — credits never expire.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PUBLIC_CREDIT_PACKAGES.map((pack) => (
          <div
            key={pack.credits}
            className={`relative rounded-xl border p-5 transition ${
              pack.popular
                ? "border-[#39b54a]/40 bg-gradient-to-b from-[#39b54a]/5 to-transparent"
                : "border-[#2a2a2a] bg-[#0a0a0a]"
            }`}
          >
            {pack.popular && (
              <span className="absolute -top-2.5 left-4 bg-[#39b54a] text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                Popular
              </span>
            )}
            {pack.bestValue && (
              <span className="absolute -top-2.5 left-4 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                Best Value
              </span>
            )}

            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-[#39b54a]" />
              <span className="text-2xl font-bold text-white">
                {pack.credits}
              </span>
              <span className="text-sm text-[#a1a1a1]">credits</span>
            </div>

            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-xl font-bold text-white">
                ${pack.price}
              </span>
            </div>
            <p className="text-xs text-[#666] mb-4">
              ${pack.perCredit} per credit
            </p>

            <Button
              onClick={() => handleBuy(pack.priceId)}
              disabled={loading !== null || !pack.priceId}
              className={`w-full font-semibold ${
                pack.popular
                  ? "bg-[#39b54a] text-black hover:bg-[#2e9140]"
                  : "bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
              }`}
            >
              {loading === pack.priceId ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : !pack.priceId ? (
                "Unavailable"
              ) : (
                "Buy Now"
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";
import { PUBLIC_CREDIT_PACKAGES } from "@/lib/stripe/publicPriceConfig";
import { toast } from "sonner";

// PayPal is optional — the button only renders once the env flag is set.
// NEXT_PUBLIC_* vars are inlined at build time: redeploy after changing it,
// in the same deploy that sets the PAYPAL_* server vars.
const paypalEnabled = process.env.NEXT_PUBLIC_PAYPAL_ENABLED === "true";

// Checkout redirects land back on /account with an outcome param.
const CHECKOUT_OUTCOMES: Record<
  string,
  { kind: "success" | "info" | "error"; message: string }
> = {
  credits_purchased: {
    kind: "success",
    message: "Payment received — your credits have been added.",
  },
  credits_pending: {
    kind: "info",
    message:
      "Payment received — your credits will appear once PayPal finishes clearing the payment (eChecks can take a few days).",
  },
  credits_canceled: {
    kind: "info",
    message: "Checkout canceled — you haven't been charged.",
  },
  credits_error: {
    kind: "error",
    message:
      "Something went wrong completing your purchase. If you were charged, contact support and we'll sort it out.",
  },
};

export function CreditPackages() {
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    for (const [param, outcome] of Object.entries(CHECKOUT_OUTCOMES)) {
      if (params.get(param) !== "true") continue;

      if (outcome.kind === "success") toast.success(outcome.message);
      else if (outcome.kind === "error") toast.error(outcome.message);
      else toast.info(outcome.message);

      // Strip the param so a refresh doesn't repeat the toast.
      params.delete(param);
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`
      );
      break;
    }
  }, []);

  const startCheckout = async (
    loadingKey: string,
    endpoint: string,
    body: Record<string, unknown>
  ) => {
    setLoading(loadingKey);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const handleBuy = (priceId: string) =>
    startCheckout(priceId, "/api/credits/purchase", { priceId });

  const handleBuyPaypal = (credits: number) =>
    startCheckout(`paypal-${credits}`, "/api/credits/purchase-paypal", {
      credits,
    });

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

            {paypalEnabled && (
              <Button
                onClick={() => handleBuyPaypal(pack.credits)}
                disabled={loading !== null}
                className="w-full mt-2 bg-transparent border border-[#2a2a2a] text-[#a1a1a1] hover:bg-[#1a1a1a] hover:text-white font-semibold"
              >
                {loading === `paypal-${pack.credits}` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Pay with PayPal"
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

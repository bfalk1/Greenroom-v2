"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Zap, X } from "lucide-react";
import { trackOutOfCreditsShown, trackOutOfCreditsCta } from "@/lib/analytics";

export interface OutOfCreditsInfo {
  /** Credits the attempted purchase costs. */
  needed: number;
  /** The user's current balance. */
  balance: number;
  itemName?: string;
  itemType?: "sample" | "preset";
}

interface SubscriptionSummary {
  tierDisplayName: string;
  creditsPerMonth: number;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

// Re-up prompt shown when a purchase needs more credits than the user has.
// Two ways out of the hole: a one-time credit pack (instant, /account) or a
// bigger monthly plan (/pricing). Full-page navigations on purpose — the
// browser then handles the #buy-credits hash scroll natively.
export function OutOfCreditsModal({
  info,
  onClose,
}: {
  info: OutOfCreditsInfo | null;
  onClose: () => void;
}) {
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [subFetched, setSubFetched] = useState(false);

  useEffect(() => {
    if (!info) return;
    trackOutOfCreditsShown({
      needed: info.needed,
      balance: info.balance,
      itemType: info.itemType,
    });
    // "Your plan refills on …" reassurance line, fetched once per mount.
    if (!subFetched) {
      setSubFetched(true);
      fetch("/api/user/subscription")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.subscription) setSub(data.subscription);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  if (!info) return null;

  const goTo = (cta: "buy_credits" | "upgrade_plan", href: string) => {
    trackOutOfCreditsCta(cta, "modal");
    window.location.href = href;
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-full bg-[#39b54a]/15 border border-[#39b54a]/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#39b54a]" />
          </div>
          <button onClick={onClose} className="text-[#a1a1a1] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">
          {info.balance > 0
            ? "Not enough credits"
            : "You're out of credits"}
        </h3>
        <p className="text-[#a1a1a1] text-sm mb-1">
          {info.itemName ? (
            <>
              &ldquo;{info.itemName}&rdquo; costs{" "}
              <span className="text-white font-medium">{info.needed}</span>{" "}
              {info.needed === 1 ? "credit" : "credits"} — you have{" "}
              <span className="text-white font-medium">{info.balance}</span>{" "}
              left.
            </>
          ) : (
            <>
              That costs{" "}
              <span className="text-white font-medium">{info.needed}</span>{" "}
              {info.needed === 1 ? "credit" : "credits"} — you have{" "}
              <span className="text-white font-medium">{info.balance}</span>{" "}
              left.
            </>
          )}
        </p>
        {sub && !sub.cancelAtPeriodEnd && (
          <p className="text-[#666] text-xs mb-5">
            Your {sub.tierDisplayName} plan adds {sub.creditsPerMonth} credits
            on {new Date(sub.currentPeriodEnd).toLocaleDateString()} — or top
            up now and keep going.
          </p>
        )}

        <div className="space-y-2 mt-5">
          <Button
            onClick={() => goTo("buy_credits", "/account#buy-credits")}
            className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold"
          >
            Get more credits
          </Button>
          <Button
            onClick={() => goTo("upgrade_plan", "/pricing")}
            variant="outline"
            className="w-full border-[#2a2a2a] hover:bg-[#2a2a2a] text-white"
          >
            Upgrade my plan
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

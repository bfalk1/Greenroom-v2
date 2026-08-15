"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Zap, X } from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";
import { trackOutOfCreditsCta } from "@/lib/analytics";

// Session-scoped dismissal: quiet after one close, but resurfaces in a new
// session if the balance is still zero.
const DISMISS_KEY = "gr_out_of_credits_banner_dismissed";

// Slim proactive nudge for paying subscribers whose balance hit zero — they
// otherwise only find out when a purchase fails. Creators/staff are excluded
// (their credits aren't how they use the platform), as are non-subscribers
// (the paywall already routes them to /pricing).
export function OutOfCreditsBanner() {
  const { user } = useUser();
  // Read once at mount. Safe against hydration mismatch: `user` is fetched
  // client-side, so this returns null on the server render either way.
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const isPayingSubscriber =
    user?.role === "USER" &&
    (user?.subscription_status === "active" ||
      user?.subscription_status === "past_due");

  if (!user || dismissed || !isPayingSubscriber || user.credits > 0) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Session-only dismissal; losing it just means the banner reappears.
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#39b54a]/30 bg-[#39b54a]/10 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-[14rem]">
          <Zap className="w-4 h-4 text-[#39b54a] shrink-0" />
          <p className="text-sm text-white">
            You&apos;re out of credits — top up or upgrade to keep downloading.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/account#buy-credits"
            onClick={() => trackOutOfCreditsCta("buy_credits", "banner")}
            className="text-sm font-semibold bg-[#39b54a] text-black hover:bg-[#2e9140] rounded-md px-3 py-1.5 transition"
          >
            Get credits
          </Link>
          <Link
            href="/pricing"
            onClick={() => trackOutOfCreditsCta("upgrade_plan", "banner")}
            className="text-sm font-medium text-[#a1a1a1] hover:text-white px-2 py-1.5 transition"
          >
            Upgrade plan
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-[#a1a1a1] hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

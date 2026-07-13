"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { trackCheckoutCompleteOutcome } from "@/lib/analytics";

// Post-payment landing for BOTH providers (Stripe success_url and the PayPal
// return route). Unlike the old /pricing?success=true toast — which announced
// "your credits are ready" purely because a URL param said so, including to
// the July 2026 buyers whose webhook deliveries were failing — this page
// VERIFIES the subscription row exists before celebrating, and is honest
// when it can't.
//
// Poll budget: webhooks normally land within a few seconds; PayPal
// activations can lag. ~24s covers the normal case without stranding the
// buyer forever — after that we show the "payment is safe" state rather than
// a fake success or an alarming error.
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 8;

type Phase = "verifying" | "active" | "unconfirmed";

interface ActiveSub {
  tierDisplayName: string;
  creditsPerMonth: number;
}

function CompleteContent() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [activeSub, setActiveSub] = useState<ActiveSub | null>(null);
  const attempts = useRef(0);

  // PayPal's return route hints the outcome; Stripe arrives hint-less. The
  // hint only shapes copy — the DB poll below is the source of truth.
  const hint = searchParams.get("status");
  const provider = searchParams.get("provider");
  // Expected tier (Stripe success_url carries it): a plan-CHANGE buyer already
  // has an ACTIVE row with the OLD tier, so "any active subscription" would
  // instantly celebrate the wrong plan — require the tier to match when known.
  const expectedTier = searchParams.get("tier");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const poll = async () => {
      attempts.current += 1;
      try {
        const res = await fetch("/api/user/subscription");
        if (res.ok) {
          const data = await res.json();
          if (
            !cancelled &&
            data?.subscription &&
            data.subscription.status === "ACTIVE" &&
            (!expectedTier || data.subscription.tierName === expectedTier)
          ) {
            setActiveSub({
              tierDisplayName: data.subscription.tierDisplayName,
              creditsPerMonth: data.subscription.creditsPerMonth,
            });
            setPhase("active");
            // Buyer-side verification metric (NOT the activation event —
            // that fires server-side from the grant): how long confirmation
            // took, and below, how often it never arrived. Rising timeouts =
            // webhook lag/misdelivery, the July 2026 failure signature.
            trackCheckoutCompleteOutcome({
              provider,
              initialStatus: hint,
              outcome: "confirmed",
              secondsToConfirm: Math.round((Date.now() - startedAt) / 1000),
            });
            return;
          }
        }
      } catch {
        // Transient — the next attempt covers it.
      }
      if (cancelled) return;
      if (attempts.current >= POLL_ATTEMPTS) {
        setPhase("unconfirmed");
        trackCheckoutCompleteOutcome({
          provider,
          initialStatus: hint,
          outcome: hint === "error" ? "error" : "timeout",
        });
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (phase === "active" && activeSub) {
    return (
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#39b54a]/15 border border-[#39b54a]/40">
          <Check className="h-7 w-7 text-[#39b54a]" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          You&apos;re in — subscription active
        </h1>
        <p className="text-[#a1a1a1] mb-8">
          Your <span className="text-white font-medium">{activeSub.tierDisplayName}</span> plan
          is live and{" "}
          <span className="text-white font-medium">
            {activeSub.creditsPerMonth} credits
          </span>{" "}
          are in your account.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/marketplace">
            <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold px-6">
              Start browsing samples
            </Button>
          </Link>
          <Link href="/account">
            <Button className="bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a] font-semibold px-6">
              View my account
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "unconfirmed") {
    return (
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-white mb-3">
          {hint === "error"
            ? "We're confirming your payment"
            : "Almost there — activation in progress"}
        </h1>
        <p className="text-[#a1a1a1] mb-4">
          Your payment is safe. Activation is taking longer than usual — our
          system reconciles every payment automatically, so your subscription
          and credits will appear without you doing anything.
        </p>
        <p className="text-[#a1a1a1] text-sm mb-8">
          Still nothing after an hour? Email{" "}
          <a
            href="mailto:support@greenroom.fm"
            className="text-[#39b54a] hover:underline"
          >
            support@greenroom.fm
          </a>{" "}
          and we&apos;ll sort it out.
        </p>
        <Button
          onClick={() => window.location.reload()}
          className="bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a] font-semibold px-6"
        >
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center max-w-md">
      <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin mx-auto mb-6" />
      <h1 className="text-2xl font-bold text-white mb-3">
        Confirming your subscription…
      </h1>
      <p className="text-[#a1a1a1]">
        {hint === "pending"
          ? "PayPal has approved your subscription — finalizing the activation now."
          : hint === "error"
            ? "Checking your payment status. This usually takes a few seconds."
            : "Payment received — setting up your plan and credits. This usually takes a few seconds."}
      </p>
    </div>
  );
}

export default function CheckoutCompletePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <CompleteContent />
      </Suspense>
    </div>
  );
}

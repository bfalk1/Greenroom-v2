import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { SUBSCRIPTION_TIERS } from "@/lib/stripe/config";
import { isPaypalConfigured, paypalFetch } from "@/lib/paypal/client";
import {
  paypalPlanIdForTier,
  paypalVipLifetimePlanId,
} from "@/lib/paypal/subscriptions";
import { vipLifetimeCouponId } from "@/lib/vipOffer";

// Payments config preflight: validates every env-driven payment dependency
// against the LIVE provider APIs and reports pass/fail per check. Exists
// because the whole class of "env skew" outages — the expired lifetime
// coupon, stale price IDs, the still-pending Vercel env batch — ships
// silently and surfaces as buyers bouncing off dead checkouts. Run it after
// every deploy (and optionally daily); a "fail" line names exactly what to
// fix.
//
// Auth: CRON_SECRET bearer, same fail-closed policy as the crons. Read-only —
// it retrieves objects, never creates or mutates anything.

type CheckResult = {
  check: string;
  status: "pass" | "fail" | "skipped";
  detail?: string;
};

function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function checkStripePrice(
  name: string,
  priceId: string | undefined
): Promise<CheckResult> {
  const check = `stripe price ${name}`;
  const id = priceId?.trim();
  if (!id) return { check, status: "fail", detail: "env var unset" };
  try {
    const price = await stripe.prices.retrieve(id);
    if (!price.active) {
      return { check, status: "fail", detail: `${id} is archived` };
    }
    return {
      check,
      status: "pass",
      detail: `${id} · ${(price.unit_amount ?? 0) / 100} ${price.currency?.toUpperCase()}`,
    };
  } catch (error) {
    return {
      check,
      status: "fail",
      detail: error instanceof Error ? error.message : "retrieve failed",
    };
  }
}

async function checkStripeCoupon(): Promise<CheckResult> {
  const check = "stripe lifetime coupon";
  const id = vipLifetimeCouponId();
  if (!id) return { check, status: "fail", detail: "STRIPE_VIP_LIFETIME_COUPON_ID unset" };
  try {
    const coupon = await stripe.coupons.retrieve(id);
    if (!coupon.valid) {
      // Exactly the July 2026 failure: coupon exists but expired/maxed —
      // every lifetime card checkout dies at session creation.
      return {
        check,
        status: "fail",
        detail: `${id} exists but is not valid (expired or max redemptions reached)`,
      };
    }
    if (coupon.duration !== "forever") {
      return {
        check,
        status: "fail",
        detail: `${id} duration is "${coupon.duration}" — the lifetime price lock requires "forever"`,
      };
    }
    return { check, status: "pass", detail: id };
  } catch (error) {
    return {
      check,
      status: "fail",
      detail: error instanceof Error ? error.message : "retrieve failed",
    };
  }
}

async function checkPaypalPlan(name: string, planId: string | null): Promise<CheckResult> {
  const check = `paypal plan ${name}`;
  if (!planId) return { check, status: "fail", detail: "env var unset" };
  try {
    const res = await paypalFetch(`/v1/billing/plans/${planId}`, {
      method: "GET",
    });
    if (!res.ok) {
      return { check, status: "fail", detail: `GET plan ${planId} → ${res.status}` };
    }
    const plan = (await res.json()) as { status?: string };
    if (plan.status !== "ACTIVE") {
      return { check, status: "fail", detail: `${planId} status ${plan.status}` };
    }
    return { check, status: "pass", detail: planId };
  } catch (error) {
    return {
      check,
      status: "fail",
      detail: error instanceof Error ? error.message : "request failed",
    };
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: CheckResult[] = [];

  // Presence-only env checks (no API call needed / possible).
  results.push({
    check: "env STRIPE_WEBHOOK_SECRET",
    status: process.env.STRIPE_WEBHOOK_SECRET?.trim() ? "pass" : "fail",
  });
  results.push({
    check: "env VIP_OFFER_SECRET",
    status: process.env.VIP_OFFER_SECRET?.trim() ? "pass" : "fail",
    detail: process.env.VIP_OFFER_SECRET?.trim()
      ? undefined
      : "unlock cookies are falling back to STRIPE_SECRET_KEY as signing key",
  });
  results.push({
    check: "env PAYPAL_ENV",
    status: process.env.PAYPAL_ENV?.trim() === "live" ? "pass" : "fail",
    detail:
      process.env.PAYPAL_ENV?.trim() === "live"
        ? undefined
        : `value ${JSON.stringify(process.env.PAYPAL_ENV ?? null)} — anything but "live" targets the sandbox`,
  });
  results.push({
    check: "env NEXT_PUBLIC_POSTHOG_KEY",
    status: process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ? "pass" : "fail",
    detail: process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
      ? undefined
      : "analytics silently disabled",
  });

  // Stripe: subscription prices + the lifetime coupon. Two things per tier:
  // (1) the CLIENT-side id (NEXT_PUBLIC_*, what the checkout page POSTs) must
  // be a live, active price; (2) it must MATCH the server-side resolution
  // (STRIPE_* takes precedence in src/lib/stripe/config.ts) — skew between
  // the two 400s every checkout as "Invalid subscription plan".
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    for (const [name, clientVar] of [
      ["GA", process.env.NEXT_PUBLIC_STRIPE_GA_PRICE_ID],
      ["VIP", process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID],
      ["AA", process.env.NEXT_PUBLIC_STRIPE_AA_PRICE_ID],
    ] as const) {
      results.push(await checkStripePrice(name, clientVar));
      const serverSide =
        SUBSCRIPTION_TIERS[name as keyof typeof SUBSCRIPTION_TIERS]
          ?.stripePriceId;
      const clientSide = (clientVar ?? "").trim();
      if (serverSide && clientSide && serverSide !== clientSide) {
        results.push({
          check: `stripe price ${name} client/server skew`,
          status: "fail",
          detail: `server resolves ${serverSide} but the client sends ${clientSide} — checkout will 400`,
        });
      }
    }
    results.push(await checkStripeCoupon());
  } else {
    results.push({
      check: "stripe",
      status: "fail",
      detail: "STRIPE_SECRET_KEY unset",
    });
  }

  // PayPal: auth + all four plans.
  if (isPaypalConfigured()) {
    results.push(await checkPaypalPlan("GA", paypalPlanIdForTier("GA")));
    results.push(await checkPaypalPlan("VIP", paypalPlanIdForTier("VIP")));
    results.push(await checkPaypalPlan("AA", paypalPlanIdForTier("AA")));
    results.push(
      await checkPaypalPlan("VIP lifetime", paypalVipLifetimePlanId())
    );
  } else {
    results.push({
      check: "paypal",
      status: "fail",
      detail: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET unset",
    });
  }

  const failed = results.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    console.error(
      `[payments-preflight] ${failed.length} check(s) failing: ${failed
        .map((f) => `${f.check}${f.detail ? ` (${f.detail})` : ""}`)
        .join("; ")}`
    );
  }

  return NextResponse.json(
    { ok: failed.length === 0, results },
    { status: failed.length === 0 ? 200 : 503 }
  );
}

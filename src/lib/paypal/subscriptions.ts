// PayPal subscription billing (Billing Plans + Subscriptions v1 API),
// alongside Stripe. Plan ids are env-mapped per tier name so sandbox and live
// stay cleanly separated (mirrors the STRIPE_*_PRICE_ID pattern).
//
// Credit-grant architecture: every billing cycle's credits are granted keyed
// by the PayPal sale/transaction id (marker row in paypal_webhook_events,
// inserted in the same transaction as the grant). The return route and the
// PAYMENT.SALE.COMPLETED webhook both funnel through grantPaypalSubscriptionCycle,
// so whichever runs second hits the marker conflict and no-ops — and there is
// no separate "initial grant" path to double-count the first cycle.

import { prisma } from "@/lib/prisma";
import { paypalFetch } from "@/lib/paypal/client";

const PLAN_ENV_BY_TIER: Record<string, string | undefined> = {
  GA: process.env.PAYPAL_GA_PLAN_ID,
  VIP: process.env.PAYPAL_VIP_PLAN_ID,
  AA: process.env.PAYPAL_AA_PLAN_ID,
};

export function paypalPlanIdForTier(tierName: string): string | null {
  return PLAN_ENV_BY_TIER[tierName] ?? null;
}

export function tierNameForPaypalPlan(planId: string): string | null {
  for (const [tierName, id] of Object.entries(PLAN_ENV_BY_TIER)) {
    if (id && id === planId) return tierName;
  }
  return null;
}

export function paypalSubscriptionsConfigured(): boolean {
  return Boolean(
    PLAN_ENV_BY_TIER.GA && PLAN_ENV_BY_TIER.VIP && PLAN_ENV_BY_TIER.AA
  );
}

interface PaypalSubscriptionResponse {
  id: string;
  status: string;
  plan_id?: string;
  custom_id?: string;
  start_time?: string;
  links?: { rel: string; href: string }[];
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string };
  };
}

export interface PaypalSubscription {
  id: string;
  status: string;
  planId: string | null;
  customId: string | null;
  approveUrl: string | null;
  periodStart: Date;
  periodEnd: Date | null;
}

function toSubscription(sub: PaypalSubscriptionResponse): PaypalSubscription {
  return {
    id: sub.id,
    status: sub.status,
    planId: sub.plan_id ?? null,
    customId: sub.custom_id ?? null,
    approveUrl:
      sub.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")
        ?.href ?? null,
    periodStart: new Date(
      sub.billing_info?.last_payment?.time ?? sub.start_time ?? Date.now()
    ),
    periodEnd: sub.billing_info?.next_billing_time
      ? new Date(sub.billing_info.next_billing_time)
      : null,
  };
}

export async function createPaypalSubscription(params: {
  planId: string;
  userId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PaypalSubscription> {
  const res = await paypalFetch("/v1/billing/subscriptions", {
    method: "POST",
    body: {
      plan_id: params.planId,
      custom_id: params.userId,
      application_context: {
        brand_name: "Greenroom",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal create subscription failed (${res.status}): ${body}`);
  }

  return toSubscription((await res.json()) as PaypalSubscriptionResponse);
}

export async function getPaypalSubscription(
  subscriptionId: string
): Promise<PaypalSubscription> {
  const res = await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`, {
    method: "GET",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal get subscription failed (${res.status}): ${body}`);
  }

  return toSubscription((await res.json()) as PaypalSubscriptionResponse);
}

export async function cancelPaypalSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  const res = await paypalFetch(
    `/v1/billing/subscriptions/${subscriptionId}/cancel`,
    { method: "POST", body: { reason } }
  );

  // 204 = canceled. 422 UNPROCESSABLE_ENTITY covers "already canceled" —
  // treat as success so a double-click or webhook race doesn't error the user.
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    throw new Error(`PayPal cancel subscription failed (${res.status}): ${body}`);
  }
}

export async function revisePaypalSubscription(params: {
  subscriptionId: string;
  planId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ approveUrl: string | null }> {
  const res = await paypalFetch(
    `/v1/billing/subscriptions/${params.subscriptionId}/revise`,
    {
      method: "POST",
      body: {
        plan_id: params.planId,
        application_context: {
          brand_name: "Greenroom",
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal revise subscription failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    links?: { rel: string; href: string }[];
  };

  return {
    approveUrl:
      data.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")
        ?.href ?? null,
  };
}

/** Completed payment transactions for a subscription, newest data included. */
export async function listPaypalSubscriptionTransactions(
  subscriptionId: string
): Promise<{ id: string; status: string; time?: string }[]> {
  // The API requires a time window; span the subscription's possible life.
  const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString();
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  const res = await paypalFetch(
    `/v1/billing/subscriptions/${subscriptionId}/transactions?start_time=${start}&end_time=${end}`,
    { method: "GET" }
  );

  if (!res.ok) {
    // Not fatal — the SALE webhook is the authoritative grant path.
    return [];
  }

  const data = (await res.json()) as {
    transactions?: { id: string; status: string; time?: string }[];
  };

  return data.transactions ?? [];
}

/**
 * Fully refund a subscription payment (subscription transactions are v1
 * sales, so this is the v1 sale refund endpoint — the credit-pack path uses
 * v2 captures and never comes through here). Empty body = full refund.
 */
export async function refundPaypalSale(saleId: string): Promise<void> {
  const res = await paypalFetch(`/v1/payments/sale/${saleId}/refund`, {
    method: "POST",
    body: {},
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal refund sale failed (${res.status}): ${body}`);
  }
}

// PayPal states we mirror locally. APPROVAL_PENDING/APPROVED have no billing
// yet; ACTIVE and every post-active state must be recorded — a paid final
// cycle can arrive AFTER cancellation and still needs a row + period dates.
const MIRRORED_STATUSES = ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"];

/**
 * Pull the subscription's current state from PayPal and mirror it locally:
 * upsert the Subscription row (provider=paypal) and keep tier and period
 * dates in sync for any billed state. Only an ACTIVE subscription flips the
 * user to active / clears cancelAtPeriodEnd; CANCELLED/EXPIRED set
 * cancelAtPeriodEnd so the daily cron ends access at period end. SUSPENDED
 * is dunning, not cancellation — it leaves cancelAtPeriodEnd alone so the
 * user can still cancel and a successful PayPal retry resumes billing (the
 * cron's past_due grace window ends access if retries never succeed).
 *
 * Used by the return route, the ACTIVATED/UPDATED webhooks, and the SALE
 * handler when events arrive before the row exists. Returns null when the
 * subscription can't be attributed (unknown plan / missing user / not yet
 * billed) or when the user's row is owned by a live Stripe subscription.
 */
export async function syncPaypalSubscription(subscriptionId: string): Promise<{
  userId: string;
  tierId: string;
  creditsPerMonth: number;
  tierDisplayName: string;
  status: string;
} | null> {
  const remote = await getPaypalSubscription(subscriptionId);

  if (!MIRRORED_STATUSES.includes(remote.status)) {
    return null;
  }

  const tierName = remote.planId ? tierNameForPaypalPlan(remote.planId) : null;
  if (!tierName) {
    console.error(
      `PayPal subscription ${subscriptionId} has unknown plan ${remote.planId}`
    );
    return null;
  }

  const tier = await prisma.subscriptionTier.findFirst({
    where: { name: tierName, isActive: true },
  });
  if (!tier) {
    console.error(`No active tier named ${tierName} for PayPal plan`);
    return null;
  }

  const userId = remote.customId;
  if (!userId) {
    console.error(`PayPal subscription ${subscriptionId} has no custom_id`);
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`PayPal subscription ${subscriptionId}: unknown user ${userId}`);
    return null;
  }

  const existing = await prisma.subscription.findUnique({ where: { userId } });

  // A live Stripe subscription owns this user's row (e.g. a stale PayPal
  // approve link used after resubscribing via Stripe). Never clobber it —
  // cancel the PayPal side so the buyer isn't double-billed.
  if (
    existing &&
    existing.provider === "stripe" &&
    existing.stripeSubscriptionId &&
    (user.subscriptionStatus === "active" ||
      user.subscriptionStatus === "past_due")
  ) {
    if (remote.status === "ACTIVE") {
      console.error(
        `PayPal subscription ${subscriptionId} superseded by live Stripe sub for user ${userId} — canceling the PayPal one`
      );
      await cancelPaypalSubscription(
        subscriptionId,
        "Superseded by an existing subscription"
      );
      // ACTIVE means a cycle was already captured, and no credits were (or
      // will be) granted for it — refund the buyer. Best effort: a failure
      // here must not block the sync, but it means money was kept for
      // nothing, so log loudly for a manual refund.
      const sales = await listPaypalSubscriptionTransactions(subscriptionId);
      const latestSale = sales
        .filter((t) => t.status === "COMPLETED")
        .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))[0];
      if (latestSale) {
        await refundPaypalSale(latestSale.id).catch((err) =>
          console.error(
            `Failed to refund PayPal sale ${latestSale.id} of superseded subscription ${subscriptionId} (user ${userId}) — refund manually:`,
            err
          )
        );
      } else {
        console.error(
          `No completed sale found for superseded PayPal subscription ${subscriptionId} (user ${userId}) — check for an unrefunded payment manually`
        );
      }
    }
    return null;
  }

  // Two PayPal subscriptions for one user (double-checkout race or a stale
  // approve link): only an ACTIVE newcomer wins the row (and the old one is
  // canceled). A non-active one — e.g. a late CANCELLED-sub event replayed
  // after the user resubscribed — must never overwrite the row that the
  // other subscription now owns.
  if (
    existing &&
    existing.provider === "paypal" &&
    existing.paypalSubscriptionId &&
    existing.paypalSubscriptionId !== subscriptionId
  ) {
    if (remote.status !== "ACTIVE") {
      console.log(
        `PayPal subscription ${subscriptionId} (${remote.status}) for user ${userId} — row owned by ${existing.paypalSubscriptionId}, not syncing`
      );
      return null;
    }
    console.error(
      `User ${userId} has a second PayPal subscription ${subscriptionId} — canceling the previous one ${existing.paypalSubscriptionId}`
    );
    await cancelPaypalSubscription(
      existing.paypalSubscriptionId,
      "Superseded by a newer subscription"
    ).catch((err) =>
      console.error("Failed to cancel superseded PayPal subscription:", err)
    );
  }

  const isActive = remote.status === "ACTIVE";
  // CANCELLED/EXPIRED are genuine cancellations; SUSPENDED is dunning and
  // must leave cancelAtPeriodEnd unchanged (undefined = untouched on update).
  const isCancelled =
    remote.status === "CANCELLED" || remote.status === "EXPIRED";
  const cancelAtPeriodEnd = isActive ? false : isCancelled ? true : undefined;
  const periodEnd =
    remote.periodEnd ??
    new Date(remote.periodStart.getTime() + 1000 * 60 * 60 * 24 * 31);

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tierId: tier.id,
      provider: "paypal",
      paypalSubscriptionId: subscriptionId,
      stripeSubscriptionId: null,
      currentPeriodStart: remote.periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
    },
    create: {
      userId,
      tierId: tier.id,
      provider: "paypal",
      paypalSubscriptionId: subscriptionId,
      currentPeriodStart: remote.periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: isCancelled,
    },
  });

  if (isActive) {
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: "active" },
    });
  }

  return {
    userId,
    tierId: tier.id,
    creditsPerMonth: tier.creditsPerMonth,
    tierDisplayName: tier.displayName,
    status: remote.status,
  };
}

/**
 * Grant one billing cycle's credits, exactly once per PayPal transaction id.
 * Safe to call from any path (return route, ACTIVATED, SALE webhook) — the
 * "sale:<id>" marker conflicts on redelivery/overlap and rolls the grant back.
 */
export async function grantPaypalSubscriptionCycle(params: {
  saleId: string;
  eventType: string;
  userId: string;
  creditsPerMonth: number;
  tierDisplayName: string;
}): Promise<"granted" | "already_granted"> {
  try {
    await prisma.$transaction([
      prisma.paypalWebhookEvent.create({
        data: { id: `sale:${params.saleId}`, type: params.eventType },
      }),
      prisma.creditBalance.upsert({
        where: { userId: params.userId },
        update: { balance: { increment: params.creditsPerMonth } },
        create: { userId: params.userId, balance: params.creditsPerMonth },
      }),
      prisma.user.update({
        where: { id: params.userId },
        data: { subscriptionStatus: "active" },
      }),
      prisma.creditTransaction.create({
        data: {
          userId: params.userId,
          amount: params.creditsPerMonth,
          type: "SUBSCRIPTION",
          referenceId: params.saleId,
          note: `${params.tierDisplayName} subscription (PayPal) — ${params.creditsPerMonth} credits`,
        },
      }),
    ]);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return "already_granted";
    }
    throw error;
  }

  console.log(
    `Granted ${params.creditsPerMonth} credits to user ${params.userId} (PayPal sale ${params.saleId})`
  );
  return "granted";
}

/**
 * Sync + grant any completed transactions PayPal already has for this
 * subscription. The return route and ACTIVATED webhook both call this; the
 * SALE webhook covers transactions that appear later.
 */
export async function activatePaypalSubscription(
  subscriptionId: string
): Promise<"active" | "pending" | "unattributable"> {
  const synced = await syncPaypalSubscription(subscriptionId);

  if (!synced) {
    const remote = await getPaypalSubscription(subscriptionId).catch(() => null);
    return remote && !MIRRORED_STATUSES.includes(remote.status)
      ? "pending"
      : "unattributable";
  }

  // Grant any completed payments regardless of current status — a paid first
  // cycle on a since-cancelled subscription is still paid-for credits.
  const transactions = await listPaypalSubscriptionTransactions(subscriptionId);
  for (const txn of transactions) {
    if (txn.status === "COMPLETED") {
      await grantPaypalSubscriptionCycle({
        saleId: txn.id,
        eventType: "activation-sync",
        userId: synced.userId,
        creditsPerMonth: synced.creditsPerMonth,
        tierDisplayName: synced.tierDisplayName,
      });
    }
  }

  return synced.status === "ACTIVE" ? "active" : "pending";
}

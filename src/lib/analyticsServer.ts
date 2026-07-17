import { after } from "next/server";
import { PostHog } from "posthog-node";

// Server-side PostHog capture for events that must not depend on a browser
// being open — subscription activations land via webhooks/crons long after
// the buyer's tab is gone, and the client-side "activated" toast has already
// proven unreliable (July 2026: buyers were told credits were ready while the
// webhook was failing). Lazily initialized; a missing key silently no-ops so
// local/dev environments and tests don't need PostHog.
let _client: PostHog | null = null;
function client(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
        "https://us.i.posthog.com",
      // Serverless: flush immediately, don't hold events in a batch that dies
      // with the lambda.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

/**
 * The authoritative "someone is now a paying subscriber" event, fired from
 * the Stripe webhook, the PayPal return route, the PayPal webhook, and the
 * reconcile crons — whichever grants the subscription. distinctId is the
 * userId (the client identifies users by the same id, so funnels stitch).
 */
export function trackSubscriptionActivatedServer(props: {
  userId: string;
  plan: string;
  provider: "stripe" | "paypal";
  lifetime: boolean;
  source?: string | null;
  via: "webhook" | "return" | "cron" | "reconcile";
}) {
  const ph = client();
  if (!ph) return;
  ph.capture({
    distinctId: props.userId,
    event: "subscription_activated",
    properties: {
      plan: props.plan,
      provider: props.provider,
      lifetime: props.lifetime,
      acquisition_source: props.source ?? null,
      via: props.via,
    },
  });
  // Flush after the response is sent. A bare fire-and-forget flush loses the
  // event whenever the lambda freezes on return — and because every capture
  // site sits behind an idempotency guard (Stripe P2002 marker / PayPal
  // activation marker), a dropped event is never re-emitted on webhook
  // retry. after() keeps the function alive for the send without adding
  // latency to the payment path; errors still never propagate into it.
  flushAfterResponse(ph);
}

/**
 * A referral was RECORDED at signup (pending — rewards wait for VIP activation).
 * Fired from whichever user-creation path won the record race (/callback or
 * /api/user/me), behind the referrals unique constraint so it happens once per
 * referred account.
 */
export function trackReferralRecordedServer(props: {
  referredUserId: string;
  referrerId: string;
  referrerRole: string;
  referredVipOffer: boolean;
  via: "callback" | "me";
}) {
  const ph = client();
  if (!ph) return;
  ph.capture({
    distinctId: props.referredUserId,
    event: "referral_recorded",
    properties: {
      referrer_id: props.referrerId,
      referrer_role: props.referrerRole,
      referred_vip_offer: props.referredVipOffer,
      via: props.via,
    },
  });
  flushAfterResponse(ph);
}

/**
 * A referral's rewards were GRANTED when the referred user activated a VIP
 * subscription. Fired from whichever activation path won the grant, behind the
 * referral's rewardedAt terminal marker so it happens once. Two captures so
 * both sides of the funnel are queryable per person.
 */
export function trackReferralRewardGrantedServer(props: {
  referredUserId: string;
  referrerId: string;
  referredCredits: number;
  referrerCredits: number;
  referrerCashCents: number;
  rewardSkippedReason?: string | null;
  via: "webhook" | "reconcile" | "return" | "cron";
}) {
  const ph = client();
  if (!ph) return;
  ph.capture({
    distinctId: props.referredUserId,
    event: "referral_reward_granted_referred",
    properties: {
      referrer_id: props.referrerId,
      referred_credits: props.referredCredits,
      via: props.via,
    },
  });
  ph.capture({
    distinctId: props.referrerId,
    event: "referral_reward_granted",
    properties: {
      referred_user_id: props.referredUserId,
      reward_credits: props.referrerCredits,
      reward_cash_cents: props.referrerCashCents,
      reward_skipped_reason: props.rewardSkippedReason ?? null,
      via: props.via,
    },
  });
  flushAfterResponse(ph);
}

function flushAfterResponse(ph: PostHog) {
  try {
    after(async () => {
      await ph.flush().catch(() => {});
    });
  } catch {
    // Outside a request scope (scripts/tests) — fall back to best-effort.
    void ph.flush().catch(() => {});
  }
}

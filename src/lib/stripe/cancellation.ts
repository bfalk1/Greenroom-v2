import type Stripe from "stripe";

/**
 * Whether Stripe has this subscription scheduled to end — what we store as
 * subscriptions.cancel_at_period_end and count as "Canceling".
 *
 * cancel_at_period_end alone misses most of them. It's how classic billing
 * mode marks a period-end cancellation, but flexible billing mode — the
 * default for subscriptions created on API version 2025-09-30.clover or later,
 * and our client pins a newer one — sets cancel_at to the period end and
 * leaves cancel_at_period_end false, including for cancellations made in the
 * customer portal. A cancel_at date means Stripe will end the subscription on
 * its own either way, so both signals count.
 */
export function stripeCancellationScheduled(
  subscription: Pick<Stripe.Subscription, "cancel_at" | "cancel_at_period_end">
): boolean {
  return subscription.cancel_at_period_end || subscription.cancel_at != null;
}

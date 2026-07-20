import posthog from "posthog-js";
import { metaTrack, metaTrackOnce, purchaseEventId } from "./metaPixel";

// Some funnel functions below ALSO send a Meta Pixel standard event
// (src/lib/metaPixel.ts) so Facebook ads can attribute and optimize against
// them. PostHog stays the source of truth for funnel analysis; the pixel gets
// only the standard-event ladder Meta optimizes on: CompleteRegistration →
// InitiateCheckout → AddPaymentInfo → Purchase (PageViews fire from
// src/components/providers/MetaPixel.tsx).

// --- Identity lifecycle ---

export function identifyUser(user: {
  id: string;
  email: string;
  role: string;
  subscription_status: string;
  is_creator: boolean;
}) {
  posthog.identify(user.id, {
    email: user.email,
    role: user.role,
    subscription_status: user.subscription_status,
    is_creator: user.is_creator,
  });
}

export function resetAnalytics() {
  posthog.reset();
}

// --- Funnel: Landing ---

// Which landing-page CTA converts. cta values: nav_join, nav_signin,
// hero_pricing, hero_browse, final_pricing, final_signin.
export function trackLandingCta(cta: string) {
  posthog.capture("landing_cta_clicked", { cta });
}

// --- Auth ---

export function trackSignup(method: "email" | "invite", source?: string) {
  // source attributes the signup to a funnel — "vip" for the lifetime offer's
  // standalone /signup path, "checkout" for the signup step embedded on
  // /checkout, "pricing" for the one embedded on /pricing — so the
  // landed→subscribed question can be segmented at the signup step instead of
  // only at the endpoints.
  posthog.capture("signup", { method, ...(source ? { source } : {}) });
  metaTrack("CompleteRegistration", {
    content_name: source ?? method,
    status: true,
  });
}

// Signup-step leaks: client validation, provider rejections, and the
// already-registered dead end each shed would-be subscribers differently.
export function trackSignupFailed(
  reason:
    | "password_mismatch"
    | "password_too_short"
    | "terms_not_accepted"
    | "already_registered"
    | "provider_error"
    | "error"
) {
  posthog.capture("signup_failed", { reason });
}

export function trackLogin() {
  posthog.capture("login");
}

export function trackLogout() {
  posthog.capture("logout");
}

// --- Referrals ---

// Copy-link click on a referral panel. context distinguishes the user-facing
// account panel from the creator earnings panel.
export function trackReferralLinkCopied(
  context: "account" | "creator_earnings"
) {
  posthog.capture("referral_link_copied", { context });
}

// --- Funnel: Signup → Purchase ---

export function trackOnboardingStarted() {
  posthog.capture("onboarding_started");
}

export function trackOnboardingCompleted() {
  posthog.capture("onboarding_completed");
}

export function trackPaywallViewed(redirectFrom?: string) {
  posthog.capture("paywall_viewed", { redirect_from: redirectFrom });
}

// Plan click on /pricing. Signed-out clickers now go to /checkout too (signup
// is inline there), so destination is always "checkout" going forward — the
// union keeps the type honest about historical "signup" events, which marked
// the old anonymous-intent leak. (/vip has its own vip_plan_selected.)
export function trackPricingPlanSelected(
  tier: string,
  opts: { signedIn: boolean; destination: "checkout" | "signup" }
) {
  posthog.capture("pricing_plan_selected", {
    tier,
    signed_in: opts.signedIn,
    destination: opts.destination,
  });
}

export function trackSubscriptionCheckout(
  plan: string,
  priceId: string,
  opts?: {
    tier?: string;
    lifetime?: boolean;
    method?: string;
    // Returned by the checkout API, which fired the same AddPaymentInfo
    // server-side via the Conversions API — passing it as the pixel eventID
    // makes Meta count the two as one. Absent (revise flow, older responses)
    // the pixel event just stands alone.
    metaEventId?: string;
  }
) {
  posthog.capture("subscription_checkout", {
    plan,
    price_id: priceId,
    tier: opts?.tier,
    lifetime: opts?.lifetime ?? false,
    payment_method: opts?.method,
  });
  metaTrack(
    "AddPaymentInfo",
    {
      content_category: "subscription",
      content_name: plan,
    },
    opts?.metaEventId
  );
}

// NOTE: subscription_activated is captured SERVER-side only (see
// src/lib/analyticsServer.ts) — it fires from the grant itself (webhook /
// PayPal return), not from a success page the buyer may never see. Don't
// reintroduce a client emitter for it: the same event name from both sides
// double-counts the funnel's key conversion.

// --- Funnel: VIP lifetime offer (/vip) ---

// Fired once when the /vip page resolves — `gate` if the password wall is
// showing, `unlocked` if the offer itself is visible (cookie already cleared).
export function trackVipOfferViewed(state: "gate" | "unlocked") {
  posthog.capture("vip_offer_viewed", { state });
}

// reason distinguishes a genuinely wrong code from the per-IP rate limiter
// (10/min) and transport errors — without it the gate's failure rate looks
// like bad codes when it's actually shared-IP throttling.
export function trackVipOfferUnlock(
  success: boolean,
  reason?: "wrong_password" | "rate_limited" | "error"
) {
  posthog.capture(success ? "vip_offer_unlocked" : "vip_offer_unlock_failed", {
    ...(reason ? { reason } : {}),
  });
}

export function trackVipPlanSelected(tier: string, lifetime: boolean) {
  posthog.capture("vip_plan_selected", { tier, lifetime });
}

// User accepted the lifetime-terms modal and is being sent to checkout.
export function trackVipLifetimeConfirmed() {
  posthog.capture("vip_lifetime_confirmed");
}

// --- Funnel: checkout page ---

// signed_in=false is the new anonymous entry (inline signup step showing);
// lifetime_eligible is null there — the eligibility API needs a session.
export function trackCheckoutViewed(props: {
  tier: string;
  lifetime: boolean;
  lifetimeEligible: boolean | null;
  signedIn: boolean;
}) {
  posthog.capture("checkout_viewed", {
    tier: props.tier,
    lifetime: props.lifetime,
    lifetime_eligible: props.lifetimeEligible,
    signed_in: props.signedIn,
  });
  metaTrack("InitiateCheckout", {
    content_category: "subscription",
    content_name: props.lifetime ? `${props.tier}-lifetime` : props.tier,
  });
}

export function trackCheckoutMethodSelected(method: "card" | "paypal") {
  posthog.capture("checkout_method_selected", { method });
}

// The event that answers "are payment errors blocking subscribers": every
// failed checkout API call is captured with its endpoint, status and message
// (previously these failures existed only in provider request logs).
export function trackCheckoutApiError(props: {
  endpoint: string;
  status: number;
  message: string;
}) {
  posthog.capture("checkout_api_error", {
    endpoint: props.endpoint,
    status: props.status,
    message: props.message,
  });
}

// /checkout/complete verification result. NOT the activation event (that is
// server-side, from the grant) — this measures what the BUYER saw: how long
// verification took, and how often it times out (webhook lag) or errors.
export function trackCheckoutCompleteOutcome(props: {
  provider: string | null;
  initialStatus: string | null;
  outcome: "confirmed" | "timeout" | "error";
  secondsToConfirm?: number;
  // Meta Pixel Purchase inputs, present when the verified subscription row is
  // in hand: tier name, tier list price, and the provider's per-transaction
  // token (Stripe checkout-session id / PayPal subscription id).
  tier?: string | null;
  valueUsdCents?: number | null;
  transactionId?: string | null;
}) {
  posthog.capture("checkout_complete_outcome", {
    provider: props.provider,
    initial_status: props.initialStatus,
    outcome: props.outcome,
    seconds_to_confirm: props.secondsToConfirm,
  });
  // Meta Purchase is the one conversion that MUST fire client-side even
  // though activation is verified server-side: the pixel needs the buyer's
  // browser (its _fbp/_fbc cookies) to attribute the ad click. This does not
  // violate the server-only rule for subscription_activated above — different
  // destination, different event. It requires the provider redirect's
  // transaction token and dedupes on it: refreshes of the same completion
  // re-verify the same token (suppressed), while a later re-subscription or a
  // second buyer on a shared browser gets a new token (fires), and a visit
  // with no token — one that merely observed an active sub — never fires.
  // Timeouts under-count here by design; the Conversions API is the eventual
  // fix for that.
  if (props.outcome === "confirmed" && props.tier && props.transactionId) {
    metaTrackOnce(purchaseEventId(props.transactionId), "Purchase", {
      content_category: "subscription",
      content_name: props.tier,
      content_type: "product",
      value: (props.valueUsdCents ?? 0) / 100,
      currency: "USD",
    });
  }
}

// --- Funnel: Browse → Play → Buy ---

export function trackSamplePlay(props: {
  sampleId: string;
  name: string;
  artist: string;
  genre?: string;
  source: "marketplace" | "library" | "favorites" | "marketplace-presets";
}) {
  posthog.capture("sample_play", {
    sample_id: props.sampleId,
    sample_name: props.name,
    artist_name: props.artist,
    genre: props.genre,
    source: props.source,
  });
}

export function trackSamplePause(sampleId: string, listenDurationMs: number) {
  posthog.capture("sample_pause", {
    sample_id: sampleId,
    listen_duration_ms: listenDurationMs,
  });
}

export function trackSamplePurchase(props: {
  sampleId: string;
  name: string;
  artist: string;
  creditPrice: number;
  playedBeforeBuy: boolean;
}) {
  posthog.capture("sample_purchase", {
    sample_id: props.sampleId,
    sample_name: props.name,
    artist_name: props.artist,
    credit_price: props.creditPrice,
    played_before_buy: props.playedBeforeBuy,
  });
}

export function trackPurchaseFailed(sampleId: string, reason: "insufficient_credits" | "error") {
  posthog.capture("purchase_failed", { sample_id: sampleId, reason });
}

// --- Discovery ---

export function trackSearch(query: string, resultCount: number) {
  posthog.capture("search", { query, result_count: resultCount });
}

export function trackFilterChange(filters: Record<string, string | undefined>) {
  posthog.capture("filter_change", filters);
}

export function trackSortChange(sortBy: string, direction: string) {
  posthog.capture("sort_change", { sort_by: sortBy, direction });
}

export function trackArtistProfileViewed(artistSlug: string) {
  posthog.capture("artist_profile_viewed", { artist_slug: artistSlug });
}

// --- Engagement ---

export function trackSampleFavorite(sampleId: string, favorited: boolean) {
  posthog.capture(favorited ? "sample_favorite" : "sample_unfavorite", {
    sample_id: sampleId,
  });
}

export function trackSampleRate(sampleId: string, score: number) {
  posthog.capture("sample_rate", { sample_id: sampleId, score });
}

export function trackArtistFollow(artistId: string, following: boolean) {
  posthog.capture(following ? "artist_follow" : "artist_unfollow", {
    artist_id: artistId,
  });
}

export function trackSampleDownload(sampleId: string, name: string, source: "library" | "marketplace" | "marketplace-presets") {
  posthog.capture("sample_download", {
    sample_id: sampleId,
    sample_name: name,
    source,
  });
}

export function trackLibraryViewed(sampleCount: number) {
  posthog.capture("library_viewed", { sample_count: sampleCount });
}

// --- Creator ---

export function trackSampleUpload(props: {
  genre: string;
  sampleType: string;
  creditPrice: number;
}) {
  posthog.capture("sample_upload", {
    genre: props.genre,
    sample_type: props.sampleType,
    credit_price: props.creditPrice,
  });
}

export function trackCreatorDashboardViewed() {
  posthog.capture("creator_dashboard_viewed");
}

import posthog from "posthog-js";
import { metaTrack, metaTrackOnce, purchaseEventId } from "./metaPixel";
import { tiktokTrack, tiktokTrackOnce } from "./tiktokPixel";
import {
  PUBLIC_SUBSCRIPTION_PACKAGES,
  VIP_FIRST_MONTH_OFFER,
} from "./stripe/publicPriceConfig";
import { currentPlatform } from "./platform";

// Some funnel functions below ALSO send ad-pixel standard events — Meta
// (src/lib/metaPixel.ts) and TikTok (src/lib/tiktokPixel.ts) — so those ad
// platforms can attribute and optimize against them. PostHog stays the source
// of truth for funnel analysis; the pixels get only the standard-event ladder
// each optimizes on: ViewContent → CompleteRegistration → InitiateCheckout →
// AddPaymentInfo → Purchase (Meta) / CompletePayment (TikTok). PageViews fire
// from the pixels' provider components.
//
// Commerce events (InitiateCheckout / AddPaymentInfo / the purchase event) must
// carry a NUMERIC `value` plus an ISO-4217 `currency` — the events managers
// flag every event missing them ("price parameter missing"), and value
// optimization can't train without them. All prices on this site are USD.
// Parameter shapes differ per platform (Meta: contents[].id/item_price;
// TikTok: contents[].content_id/price), so each pixel call is built inline.

// --- Identity lifecycle ---

export function identifyUser(user: {
  id: string;
  email: string;
  role: string;
  subscription_status: string;
  is_creator: boolean;
}) {
  // last_platform/first_platform answer "who uses the desktop app vs the
  // website" at the person level (identify fires on app load, so
  // last_platform tracks the surface each user most recently opened).
  // "Uses both" needs the event-level `platform` super property instead —
  // person props only keep one value.
  const platform = currentPlatform();
  posthog.identify(
    user.id,
    {
      email: user.email,
      role: user.role,
      subscription_status: user.subscription_status,
      is_creator: user.is_creator,
      last_platform: platform,
    },
    { first_platform: platform }
  );
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
  tiktokTrack("CompleteRegistration", {
    content_name: source ?? method,
  });
}

// Signup-step leaks: client validation, provider rejections, and the
// already-registered dead end each shed would-be subscribers differently.
export function trackSignupFailed(
  reason:
    | "password_mismatch"
    | "password_too_short"
    | "name_missing"
    | "country_missing"
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

// A client-side navigation into a plan grid (landing CTA, navbar link, back
// button) mounts PricingContent TWICE: React discards the first tree ~10ms in
// and mounts a fresh instance, so a component-level useRef guard — a new ref
// per instance — cannot see the first fire. Verified against a production
// build, so this is not a dev/StrictMode artifact: both pixels were getting
// two ViewContents for one visit, inflating the top of the funnel (a hard
// landing straight onto the URL fires once; only in-app navs doubled). Module
// scope survives the remount, so the de-duplication lives here rather than in
// any component. Keys carry the offer/interval, so switching the billing
// toggle still sends a fresh view — annual is a different product at a
// different price — while a re-switch back to one already reported does not.
// Two windows, because the two problems have different shapes. A discarded
// mount re-fires ~10ms later, so a few seconds covers it with room to spare —
// that is all /checkout needs, and keeping it short there preserves a real
// signal: a buyer who bounces back and retries checkout IS a second intent.
// The plan grid needs the longer one: its billing toggle sits directly above
// the cards and re-runs the view effect on every click, so a short window lets
// one visitor flip month/year/month/year and mint a valued ViewContent each
// time — inflating exactly the number this change exists to make trustworthy.
// At ten minutes a visit reports each product at most once, and a genuine
// return later in a long session still counts. Under-counting is the safer
// failure mode here: an inflated `value` trains value-based bidding on revenue
// that was never viewed, while a missed view only costs a little signal.
const REMOUNT_DEDUPE_MS = 5_000;
const PRODUCT_VIEW_DEDUPE_MS = 600_000;
const lastPixelViewAt = new Map<string, number>();

function pixelViewAlreadySent(key: string, windowMs: number): boolean {
  const now = Date.now();
  const previous = lastPixelViewAt.get(key) ?? 0;
  if (now - previous < windowMs) return true;
  lastPixelViewAt.set(key, now);
  return false;
}

// Pixel-only ViewContent for the plan grid: the listing is this funnel's
// product view, and ad-clickers land on it anonymous — so unlike
// paywall_viewed (signed-in only, a PostHog conversion metric) this fires for
// EVERY visitor and only to the pixels. Fills the PageView→InitiateCheckout
// gap in both event ladders; pixel-only by design (single-channel events
// need no CAPI twin/dedup — see docs/meta-capi-runbook.md).
//
// interval mirrors the page's billing toggle: an annual viewer is looking at a
// ~$183 product, not a $17.99 one, and reporting the monthly price for both
// understates every annual-driven conversion.
export function trackPricingViewed(interval: "month" | "year" = "month") {
  if (pixelViewAlreadySent(`pricing:${interval}`, PRODUCT_VIEW_DEDUPE_MS)) {
    return;
  }
  const annual = interval === "year";
  const priceOf = (p: (typeof PUBLIC_SUBSCRIPTION_PACKAGES)[number]) =>
    annual ? p.annualPrice : p.price;
  // Both events managers flag a commerce event with no top-level `value`
  // ("missing value parameter") — per-item prices (Meta contents[].item_price,
  // TikTok contents[].price) do NOT satisfy it, and without it ROAS and
  // value-based bidding have nothing to train on. A plan grid has no single
  // price, and the SUM of all three tiers would be a lie: a visitor buys
  // exactly one plan. Use the highlighted tier's price — the plan the page
  // pushes and the one most buyers take — as the value of a conversion arising
  // from this view. content_name carries the -annual suffix on the same
  // convention as trackCheckoutViewed's offerSuffix, while contents[] ids stay
  // bare tier names so a tier reads identically across the whole ladder.
  const featured =
    PUBLIC_SUBSCRIPTION_PACKAGES.find((p) => p.highlighted) ??
    PUBLIC_SUBSCRIPTION_PACKAGES[0];
  const contentName = `${featured.tierName}${annual ? "-annual" : ""}`;
  metaTrack("ViewContent", {
    content_category: "subscription",
    content_name: contentName,
    content_type: "product",
    content_ids: PUBLIC_SUBSCRIPTION_PACKAGES.map((p) => p.tierName),
    contents: PUBLIC_SUBSCRIPTION_PACKAGES.map((p) => ({
      id: p.tierName,
      quantity: 1,
      item_price: priceOf(p),
    })),
    value: priceOf(featured),
    currency: "USD",
  });
  tiktokTrack("ViewContent", {
    content_type: "product",
    content_id: featured.tierName,
    content_name: contentName,
    contents: PUBLIC_SUBSCRIPTION_PACKAGES.map((p) => ({
      content_id: p.tierName,
      content_name: p.tierName,
      quantity: 1,
      price: priceOf(p),
    })),
    value: priceOf(featured),
    currency: "USD",
  });
}

// Plan click on /pricing. Signed-out clickers now go to /checkout too (signup
// is inline there), so destination is always "checkout" going forward — the
// union keeps the type honest about historical "signup" events, which marked
// the old anonymous-intent leak. (/vip has its own vip_plan_selected.)
export function trackPricingPlanSelected(
  tier: string,
  opts: {
    signedIn: boolean;
    destination: "checkout" | "signup";
    // Which billing toggle was active — "year" for the annual option.
    interval?: "month" | "year";
  }
) {
  posthog.capture("pricing_plan_selected", {
    tier,
    signed_in: opts.signedIn,
    destination: opts.destination,
    billing_interval: opts.interval ?? "month",
  });
}

export function trackSubscriptionCheckout(
  plan: string,
  priceId: string,
  opts?: {
    tier?: string;
    lifetime?: boolean;
    firstMonth?: boolean;
    interval?: "month" | "year";
    method?: string;
    // The price the buyer committed to (discount applied), in cents.
    valueUsdCents?: number;
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
    first_month: opts?.firstMonth ?? false,
    billing_interval: opts?.interval ?? "month",
    payment_method: opts?.method,
  });
  metaTrack(
    "AddPaymentInfo",
    {
      content_category: "subscription",
      content_name: plan,
      ...(typeof opts?.valueUsdCents === "number"
        ? {
            content_type: "product",
            contents: [{ id: opts.tier ?? plan, quantity: 1 }],
            value: opts.valueUsdCents / 100,
            currency: "USD",
          }
        : {}),
    },
    opts?.metaEventId
  );
  tiktokTrack("AddPaymentInfo", {
    content_name: plan,
    ...(typeof opts?.valueUsdCents === "number"
      ? {
          content_type: "product",
          contents: [
            {
              content_id: opts.tier ?? plan,
              content_name: plan,
              quantity: 1,
              price: opts.valueUsdCents / 100,
            },
          ],
          value: opts.valueUsdCents / 100,
          currency: "USD",
        }
      : {}),
  });
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

// --- Funnel: VIP first-month promo (/promo) ---

// Fired once per /promo page load — the denominator for the promo funnel.
// Also the Meta/TikTok ViewContent product view: /promo is an ad landing page
// like /pricing, and its visitors are anonymous, so the product view fires
// for everyone and only to the pixels (single-channel — no CAPI twin/dedup
// needed, same reasoning as trackPricingViewed).
// surface distinguishes the two pages that fire this: "offer" is /promo itself,
// "grid" is /promo/pricing. It keys the dedupe so the click-through from one to
// the other still reports its own product view, and it rides along on the
// PostHog event as a new property (additive — the event's VOLUME is unchanged).
export function trackPromoOfferViewed(surface: "offer" | "grid" = "offer") {
  posthog.capture("promo_offer_viewed", { surface });
  // Same missing-`value` gap and same double-mount as trackPricingViewed above
  // — see the notes there. The PostHog capture stays OUTSIDE the dedupe on
  // purpose: promo_offer_viewed is an existing funnel denominator, and silently
  // changing its volume would break comparisons against every promo number
  // reported so far. (It double-fires on client navs for the same reason the
  // pixels did — worth fixing deliberately, not as a side effect of this one.)
  if (pixelViewAlreadySent(`promo:${surface}`, PRODUCT_VIEW_DEDUPE_MS)) return;
  const contentName = `${VIP_FIRST_MONTH_OFFER.tierName}-first-month`;
  metaTrack("ViewContent", {
    content_category: "subscription",
    content_name: contentName,
    content_type: "product",
    content_ids: [VIP_FIRST_MONTH_OFFER.tierName],
    contents: [
      {
        id: VIP_FIRST_MONTH_OFFER.tierName,
        quantity: 1,
        item_price: VIP_FIRST_MONTH_OFFER.firstMonthPrice,
      },
    ],
    // The intro price is what this visitor is actually being sold, and it is
    // what InitiateCheckout/Purchase will report for the same buyer — a view
    // valued at the full $17.99 would overstate every promo conversion.
    value: VIP_FIRST_MONTH_OFFER.firstMonthPrice,
    currency: "USD",
  });
  tiktokTrack("ViewContent", {
    content_type: "product",
    content_id: VIP_FIRST_MONTH_OFFER.tierName,
    content_name: contentName,
    contents: [
      {
        content_id: VIP_FIRST_MONTH_OFFER.tierName,
        content_name: VIP_FIRST_MONTH_OFFER.tierName,
        quantity: 1,
        price: VIP_FIRST_MONTH_OFFER.firstMonthPrice,
      },
    ],
    value: VIP_FIRST_MONTH_OFFER.firstMonthPrice,
    currency: "USD",
  });
}

// CTA click on /promo, headed to /checkout with the first-month flag.
export function trackPromoPlanSelected(tier: string) {
  posthog.capture("promo_plan_selected", { tier, first_month: true });
}

// --- Funnel: checkout page ---

// signed_in=false is the new anonymous entry (inline signup step showing);
// lifetime_eligible is null there — the eligibility API needs a session.
export function trackCheckoutViewed(props: {
  tier: string;
  lifetime: boolean;
  // The $5.99-first-month flow (/promo or the /pricing VIP card). Shares
  // lifetime's eligibility field below — both offers use the same never-paid
  // verdict.
  firstMonth?: boolean;
  // "year" when the annual billing option is being checked out.
  interval?: "month" | "year";
  lifetimeEligible: boolean | null;
  signedIn: boolean;
  // The price the buyer is being shown at render, in cents (discount applied
  // when the page is applying it). An estimate is fine here — the exact
  // charge rides on AddPaymentInfo/Purchase — but the field itself is
  // required: see the commerce-events note at the top of this file.
  valueUsdCents: number;
}) {
  const offerSuffix = props.lifetime
    ? "-lifetime"
    : props.firstMonth
      ? "-first-month"
      : props.interval === "year"
        ? "-annual"
        : "";
  posthog.capture("checkout_viewed", {
    tier: props.tier,
    lifetime: props.lifetime,
    first_month: props.firstMonth ?? false,
    billing_interval: props.interval ?? "month",
    lifetime_eligible: props.lifetimeEligible,
    signed_in: props.signedIn,
  });
  // CheckoutContent is the same shape as the plan grid — useSearchParams()
  // inside a <Suspense> — so its own useRef guard has the same hole: the
  // discarded first mount fires, then a fresh instance with a fresh ref fires
  // again. Signed-in lifetime/promo buyers are incidentally spared (their
  // effect waits on the eligibility verdict, which outlives the discarded
  // tree), but plain and annual checkouts are not, and InitiateCheckout is a
  // VALUED event — a double-fire overstates checkout intent in dollars, not
  // just in count. Short window: only the remount needs covering, and a buyer
  // who genuinely comes back to retry after an error should still be counted.
  // PostHog's capture stays above this guard — checkout_viewed is an existing
  // funnel denominator and its volume must not change silently.
  const dedupeKey = `checkout:${props.tier}${offerSuffix}`;
  if (pixelViewAlreadySent(dedupeKey, REMOUNT_DEDUPE_MS)) return;
  metaTrack("InitiateCheckout", {
    content_category: "subscription",
    content_name: `${props.tier}${offerSuffix}`,
    content_type: "product",
    contents: [{ id: props.tier, quantity: 1 }],
    value: props.valueUsdCents / 100,
    currency: "USD",
  });
  tiktokTrack("InitiateCheckout", {
    content_type: "product",
    content_name: `${props.tier}${offerSuffix}`,
    contents: [
      {
        content_id: props.tier,
        content_name: props.tier,
        quantity: 1,
        price: props.valueUsdCents / 100,
      },
    ],
    value: props.valueUsdCents / 100,
    currency: "USD",
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
    tiktokTrackOnce(purchaseEventId(props.transactionId), "CompletePayment", {
      content_type: "product",
      content_name: props.tier,
      contents: [
        {
          content_id: props.tier,
          content_name: props.tier,
          quantity: 1,
          price: (props.valueUsdCents ?? 0) / 100,
        },
      ],
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

// The out-of-credits prompt appeared (a purchase needed more credits than the
// caller had). Paired with the CTA event below to measure how many stalled
// purchases the re-up prompt actually recovers.
export function trackOutOfCreditsShown(props: {
  needed: number;
  balance: number;
  itemType?: "sample" | "preset";
}) {
  posthog.capture("out_of_credits_shown", {
    needed: props.needed,
    balance: props.balance,
    item_type: props.itemType ?? null,
  });
}

export function trackOutOfCreditsCta(
  cta: "buy_credits" | "upgrade_plan",
  source: "modal" | "banner"
) {
  posthog.capture("out_of_credits_cta_clicked", { cta, source });
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

export function trackCreatorWelcomeShown(props: {
  contentCount: number;
  platform: "desktop_app" | "web";
}) {
  posthog.capture("creator_welcome_shown", {
    content_count: props.contentCount,
    has_uploads: props.contentCount > 0,
    surface: props.platform,
  });
}

export function trackCreatorWelcomeCta(
  cta: "upload_now" | "dismiss",
  props: { contentCount: number; platform: "desktop_app" | "web" }
) {
  posthog.capture("creator_welcome_cta", {
    cta,
    content_count: props.contentCount,
    surface: props.platform,
  });
}

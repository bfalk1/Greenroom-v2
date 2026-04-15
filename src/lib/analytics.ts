import posthog from "posthog-js";

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

// --- Auth ---

export function trackSignup(method: "email" | "invite") {
  posthog.capture("signup", { method });
}

export function trackLogin() {
  posthog.capture("login");
}

export function trackLogout() {
  posthog.capture("logout");
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

export function trackSubscriptionCheckout(plan: string, priceId: string) {
  posthog.capture("subscription_checkout", { plan, price_id: priceId });
}

export function trackSubscriptionActivated(plan: string) {
  posthog.capture("subscription_activated", { plan });
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

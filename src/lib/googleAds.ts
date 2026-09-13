// Google Ads conversion-event wrapper — the events-side counterpart to the
// base tag in src/components/providers/GoogleTag.tsx. Entirely inert unless
// NEXT_PUBLIC_GOOGLE_ADS_ID is set: every call below no-ops, so dev/preview
// stay clean. Like the Meta pixel, this exists so Google can attribute and
// optimize ad delivery — funnel analytics live in PostHog, not here.

import { countryToIso2 } from "./countries";
import { splitName } from "./metaPixel";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function googleAdsId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || undefined;
}

// Conversion-action label for the "Purchase" conversion, from the Google Ads
// account's tag setup (shared by novembr, 2026-08-20). Labels are per-action,
// not per-site: a new conversion action in Google Ads means a new constant
// here. The full routing id gtag wants is "<AW-id>/<label>".
export const GOOGLE_ADS_PURCHASE_LABEL = "KtVpCPKF-eQcEKT556pE";

export function googleAdsPurchaseSendTo(): string | undefined {
  const id = googleAdsId();
  return id ? `${id}/${GOOGLE_ADS_PURCHASE_LABEL}` : undefined;
}

// Return the page's gtag, installing the queue stub if it is somehow missing.
// GoogleTag.tsx's inline script normally installs the stub at hydration,
// strictly before any conversion here can fire (conversions only fire from
// fetch callbacks, never from a mount effect racing the root layout's
// scripts) — so this fallback is belt-and-braces, mirroring initMetaPixel's
// install-from-every-wrapper rule. gtag.js replays the queue on load, so
// pushes made before the script arrives still count.
function gtagFn(): ((...args: unknown[]) => void) | null {
  if (typeof window === "undefined" || !googleAdsId()) return null;
  if (window.gtag) return window.gtag;
  window.dataLayer = window.dataLayer || [];
  // gtag.js only understands entries pushed as `arguments` objects — a plain
  // array push is the (different) GTM container syntax and is silently
  // ignored — so this must stay a classic function, not a rest-param arrow.
  const gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag = gtag;
  return gtag;
}

// The Google Ads Purchase conversion, fired on /checkout/complete once the
// subscription row is VERIFIED active (same gate as the Meta pixel Purchase —
// see trackCheckoutCompleteOutcome in src/lib/analytics.ts).
//
// Dedup is two layers. transaction_id is Google's own server-side dedup:
// repeat conversions carrying the same id count once, so a cleared-storage
// refresh cannot inflate spend metrics. The localStorage guard mirrors
// metaTrackOnce and keeps repeat hits off the wire in the first place. The
// storage namespace is deliberately NOT metapixel's: Meta suppresses its
// browser Purchase on verification timeout because the Conversions API twin
// owns the event from then on, but Google has no server-side channel — a
// buyer revisiting the completion URL after a timeout-then-activation is this
// conversion's ONLY chance to fire, and a shared marker would kill it.
export function googleAdsPurchase(props: {
  transactionId: string;
  valueUsdCents: number;
}) {
  const gtag = gtagFn();
  const sendTo = googleAdsPurchaseSendTo();
  if (!gtag || !sendTo) return;
  const storageKey = `googleads:once:purchase:${props.transactionId}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Storage unavailable (private mode / blocked): fire anyway —
    // transaction_id still dedupes server-side, and a possible duplicate
    // beats silently dropping the conversion.
  }
  gtag("event", "conversion", {
    send_to: sendTo,
    value: props.valueUsdCents / 100,
    currency: "USD",
    transaction_id: props.transactionId,
  });
}

// Enhanced Conversions — Google's counterpart to Meta's Advanced Matching,
// and the same call-site contract: staged from the UserContext identify point
// once the signed-in user is known, so it is in place before any conversion
// fires. gtag.js itself normalizes and SHA-256 hashes email/first/last before
// transmission (like fbevents), so raw values never leave the browser
// un-hashed; city/region/postal/country ride in clear per Google's spec.
// Two switches gate the pipeline: GoogleTag.tsx's allow_enhanced_conversions
// makes gtag transmit this at all, and the per-conversion-action Enhanced
// Conversions toggle in the Ads account makes Google use it — until novembr
// flips the latter, the payload is carried but ignored, which is the
// intended rollout order (tag first, toggle second).
export function googleAdsSetUserData(user: {
  email?: string | null;
  fullName?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  const gtag = gtagFn();
  if (!gtag) return;

  const userData: Record<string, unknown> = {};
  if (user.email?.trim()) userData.email = user.email.trim();

  const address: Record<string, string> = {};
  const [firstName, lastName] = splitName(user.fullName);
  if (firstName) address.first_name = firstName;
  if (lastName) address.last_name = lastName;
  if (user.city?.trim()) address.city = user.city.trim();
  if (user.state?.trim()) address.region = user.state.trim();
  if (user.postalCode?.trim()) address.postal_code = user.postalCode.trim();
  // Google matches country on uppercase ISO 3166-1 alpha-2 ("US"), the
  // opposite casing of what countryToIso2 emits for Meta; unresolvable
  // values are omitted — sending nothing beats sending a value that can
  // never match.
  const iso2 = countryToIso2(user.country);
  if (iso2) address.country = iso2.toUpperCase();
  if (Object.keys(address).length > 0) userData.address = address;

  // Nothing usable → stage nothing (don't overwrite data a previous page
  // load staged with an empty object for no reason).
  if (Object.keys(userData).length === 0) return;
  gtag("set", "user_data", userData);
}

// Logout hygiene, mirroring metaClearAdvancedMatching: gtag's `set` replaces
// the stored value wholesale, so an empty object leaves later events on a
// shared browser with no signed-out person's identifiers attached.
export function googleAdsClearUserData() {
  const gtag = gtagFn();
  if (!gtag) return;
  gtag("set", "user_data", {});
}

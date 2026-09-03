// Readiness gate between the ad pixels' identity attachment and the
// conversion events that depend on it.
//
// All three ad channels attach the signed-in user's identifiers ONCE, from
// the UserContext identify point, after /api/user/me resolves. A conversion
// fired from a freshly-loaded page can beat that:
//
//   identity   auth.getUser() -> /api/user/me (up to 3 retries) -> async SHA-256
//   conversion /api/user/subscription -> CompletePayment / Purchase
//
// The conversion needs ONE round trip, identity needs two plus a hash, so on
// /checkout/complete — which always loads cold, straight off the provider
// redirect — the conversion reliably won and went out with no identifiers at
// all. TikTok reported 0% email and 0% external_id coverage on the purchase
// event and raised the Critical "Email and phone are missing" diagnostic;
// an unmatched conversion is an unattributed conversion, which is what a
// campaign reporting spend but zero conversions looks like.
//
// Waiting here, rather than assembling identity locally on the completion
// page, is deliberate: fbq("init", …) and gtag("set", "user_data", …) each
// REPLACE their stored identity set wholesale, so attaching a thinner set
// built from whatever that page happens to know would silently downgrade
// Meta and Google match quality to fix TikTok's. One attachment point stays
// the single source of truth; callers just wait for it.

let attached = false;
let signalAttached: (() => void) | undefined;
let attachedPromise = new Promise<void>((resolve) => {
  signalAttached = resolve;
});

// Called once the async identity attachments have settled (resolved OR
// rejected — a failed hash must not strand a conversion forever).
export function markAdIdentityAttached() {
  if (attached) return;
  attached = true;
  signalAttached?.();
}

// Logout hygiene, mirroring metaClearAdvancedMatching / tiktokClearIdentity /
// googleAdsClearUserData: the identifiers those drop are exactly the ones this
// gate reports as ready, so arm a fresh promise for the next signed-in user.
export function resetAdIdentity() {
  attached = false;
  attachedPromise = new Promise<void>((resolve) => {
    signalAttached = resolve;
  });
}

// Resolves when identity has been attached, or when timeoutMs elapses —
// whichever comes first. The timeout is the safety valve: a persistently
// failing /api/user/me must degrade to an unidentified conversion, never to
// no conversion at all. Nothing user-visible waits on this (the success
// screen has already rendered by the time a caller awaits it), so the budget
// is set to comfortably outlast /api/user/me's own retry ladder.
export function waitForAdIdentity(timeoutMs = 5000): Promise<void> {
  if (attached) return Promise.resolve();
  return Promise.race([
    attachedPromise,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

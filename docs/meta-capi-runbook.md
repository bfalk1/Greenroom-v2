# Meta Conversions API (CAPI) — setup & verification runbook

The browser pixel (`src/lib/metaPixel.ts`) loses every conversion made behind
an ad blocker or Safari/Brave tracking prevention, plus every
`/checkout/complete` timeout. The Conversions API (`src/lib/metaCapiServer.ts`)
re-reports the two events that matter for ad delivery — **AddPaymentInfo**
(from the checkout API routes) and **Purchase** (from the server-authoritative
activation paths: Stripe webhook, Stripe reconcile cron, PayPal sync) — from
the server, where nothing can be blocked. Meta deduplicates the two channels
on `(event_name, event_id)` within 48h, so once both sides carry the shared
event id, running both never double-counts; it only fills the holes the pixel
leaves. (Pre-deploy client bundles send NO eventID — see the rollover note
below.)

Both stay enabled together deliberately (Meta's "redundant setup"
recommendation): the pixel carries the richest browser signals when it works;
CAPI guarantees the conversion arrives when it doesn't.

## One-time ops setup

1. **Generate the access token**: Meta Events Manager → select pixel
   `27493326250295385` → **Settings** tab → *Conversions API* section →
   **Generate access token** (admin only; no App Review, no permissions).
2. **Vercel env** (production): set `META_CAPI_ACCESS_TOKEN` to that token.
   `NEXT_PUBLIC_META_PIXEL_ID` is already set. Leave
   `META_CAPI_TEST_EVENT_CODE` **unset** in production.
3. **Apply the migration** `20260717000000_add_checkout_attribution`
   (additive table; PayPal browser-signal storage) before or with the deploy.
4. Redeploy.

Without the token the whole CAPI layer silently no-ops — the code is safe to
deploy before the ops steps.

**Rollover sequencing**: prefer setting `META_CAPI_ACCESS_TOKEN` a day or so
AFTER the code deploy, not with it. Buyers in long-lived pre-deploy tabs run
stale bundles whose pixel events carry no eventID and therefore cannot dedup
against the new server events — enabling the token immediately inflates
AddPaymentInfo for as long as stale tabs survive (Purchase is barely affected:
`/checkout/complete` is always a fresh document load, so only checkouts in
flight at the deploy instant can skew). Deploying code first and the token a
day later costs nothing — CAPI no-ops until the token exists.

## Verifying an integration change

1. Events Manager → pixel → **Test Events** tab → copy the `TEST…` code.
2. Locally set `META_CAPI_TEST_EVENT_CODE=TEST…` plus the token; run a
   checkout (Stripe test mode; the cron can stand in for the webhook).
3. Server events appear in Test Events within seconds, labeled *Server*.
   Browser pixel events appear as *Browser*; matching ids show as
   **Deduplicated**.
4. Remove the test code when done — test-coded events still count in ads
   measurement; they are not sandboxed.

## Event/id contract (do not drift)

| Event | Browser fires | Server fires | Shared id |
|---|---|---|---|
| AddPaymentInfo | checkout page, after the checkout API 2xx | checkout API routes | `addpayment:<cs_… / I-…>` (route-generated, returned as `metaEventId`) |
| Purchase | `/checkout/complete` after verified ACTIVE | activation paths | `purchase:<cs_… / I-…>` via `purchaseEventId()` |

`transactionId` is the Stripe **checkout-session id** or PayPal
**subscription id** — the token the buyer's redirect carries. The Stripe
reconcile cron recovers the session id with one `checkout.sessions.list` call;
PayPal activations read browser signals from the `checkout_attributions` row
the checkout route wrote.

PageView / ViewContent / CompleteRegistration / InitiateCheckout are
**pixel-only** by design — single-channel events need no dedup and add little
to ad delivery. Corollary: Events Manager's "your server is sending fewer
InitiateCheckout events than pixel" (event-coverage) warning is EXPECTED and
not a defect — there is no server twin to send. If an ad set optimizes on a
mid-funnel event, prefer **AddPaymentInfo** (dual-channel, ad-blocker-proof)
over InitiateCheckout.

## Event parameters (value / currency)

Commerce events (InitiateCheckout, AddPaymentInfo, Purchase) carry a NUMERIC
`value` in dollars, `currency: "USD"` (ISO-4217 — never `$`/words), and
`contents: [{ id: <tier name>, quantity: 1 }]` on BOTH channels — Events
Manager flags every commerce event missing value/currency ("price parameter
missing") and value optimization can't train without them. The value is the
price the buyer is seeing/committed to, lifetime discount applied (source:
`publicPriceConfig` client-side, `tier.priceUsdCents` or
`VIP_LIFETIME_OFFER.lifetimePrice` server-side). ViewContent (on /pricing)
sends the plan list as `contents` with `item_price`, no top-level value — no
single value describes a three-plan listing.

## Constraints inherited from Meta

- `action_source=website` events REQUIRE `client_user_agent` +
  `event_source_url`; the sender skips (and warns) when no user agent was
  captured rather than sending an invalid batch.
- `em`/`external_id` are SHA-256 hashed (email lowercased+trimmed first);
  `fbp`/`fbc`/IP/UA must stay raw.
- `event_time` is Unix seconds, < 7 days old.
- Graph API pinned at v25.0 (released 2026-02; ~2-year support window).

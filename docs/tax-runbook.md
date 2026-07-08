# Sales-tax runbook (Stripe + PayPal)

Greenroom is a Canadian **small supplier**: no obligation to register or charge
tax until **CAD $30,000 of worldwide revenue over four rolling calendar
quarters** (~USD $22k). US / rest-of-world subscribers are **zero-rated exports
(0%)** but still count toward the $30k threshold. Not tax advice — have an
accountant confirm registration timing.

## Pricing model: TAX-EXCLUSIVE (tax added on top)

The customer pays the advertised price **plus** their provincial rate; the tax
comes out of the customer, not our margin. Chosen because a large Canadian
customer base makes absorbing tax too costly. Note: existing Canadian
subscribers will see their total rise (e.g. ON $9.99 → $11.29) once enabled.

## How each provider computes the rate

- **Stripe** — Stripe Tax computes location tax natively from the customer's
  billing address. One flag + dashboard config; no rate table in code.
- **PayPal** — CANNOT do location tax. We look the rate up ourselves in
  `src/lib/tax/canadaRates.ts`, collect the buyer's country/province on the
  `/checkout` page (PayPal path only), recompute the rate **server-side** in
  `checkout-paypal/route.ts` (never trusting the client), and pass it to PayPal
  as `taxes: { percentage, inclusive: false }`. The two are kept consistent by
  mirroring `NEXT_PUBLIC_TAX_PST_PROVINCES` to your Stripe registrations.

## Flags (single source of truth for both providers)

- `NEXT_PUBLIC_TAX_ENABLED=true` — master on/off. Gates Stripe's automatic_tax
  and PayPal's tax injection + the checkout region selector. Ships **inert**
  (unset) so nothing changes until you flip it.
- `NEXT_PUBLIC_TAX_PST_PROVINCES` — comma list (e.g. `BC,QC`) of provinces where
  you're registered for the *separate* provincial tax (BC PST / SK PST / MB RST
  / QC QST). Empty = GST/HST only. Mirror to your Stripe registrations.

## Code state (shipped, INERT until the flag is set)

- Rate table: `src/lib/tax/canadaRates.ts` (`canadaTaxPercent`, `CA_PROVINCES`,
  `taxCollectionEnabled`). Rates current as of 2026-07 (NS 14%).
- Stripe: `stripeTaxCheckoutParams()` in `src/lib/stripe/config.ts`, spread into
  `subscription/checkout/route.ts`. (Inclusive/exclusive is a per-Price setting.)
- PayPal subs: `createPaypalSubscription({ taxPercent })` +
  `subscription/checkout-paypal/route.ts` (server-side recompute).
- Checkout UI: region selector + tax line on `src/app/(main)/checkout/page.tsx`,
  shown only for a new PayPal subscription when tax is enabled.

## To turn tax ON (do in this order)

1. **Stripe Dashboard → Tax**: enable Stripe Tax, set origin/registration
   address. Add a registration only where actually registered — elsewhere it
   monitors thresholds and charges $0.
2. **Each subscription Price** (GA / VIP / AA): set **Tax behavior = Exclusive**
   and a digital-audio **product tax code**. (automatic_tax 400s on a price with
   no tax_behavior.)
3. **Billing Portal** config: enable automatic tax (covers Stripe plan changes).
4. **PayPal — verify "Billing Plan Override" permission.** The PayPal tax is
   sent as a per-subscription `plan.taxes` override (the only place PayPal v1
   accepts subscription tax). Some accounts need Billing Plan Override enabled
   or the create call 422s ("Billing Plan Override is not allowed…"). Test a
   Canadian PayPal subscribe in **sandbox** first — it should show tax on the
   PayPal approval page. A 422 fails closed (checkout errors) rather than
   under-charging, but you don't want that in prod.
5. Set **`NEXT_PUBLIC_TAX_ENABLED=true`** and `NEXT_PUBLIC_TAX_PST_PROVINCES`
   (matching your Stripe registrations) in Vercel, then redeploy.
6. Smoke-test: Canadian card → provincial tax on top; Canadian PayPal → same
   total via the region selector AND on PayPal's approval page; US → $0 tax on
   both.

## Known follow-ups (NOT covered yet)

- **Credit packs are untaxed on both providers** (Stripe `credits/purchase` and
  PayPal `credits/purchase-paypal`). Deferred deliberately — the one-time PayPal
  order records + settlement-verifies its amount, and the buy UI lives on
  `/account`, so it's its own change. Do both providers together.
- **PayPal plan-changes (revise)** keep the tax fixed at original subscription
  creation. A buyer who moves provinces keeps their old rate until they
  resubscribe. Acceptable for now; revisit if it matters.
- **Self-declared region** on the PayPal path isn't validated against the payer's
  PayPal account country (Stripe validates against the card). Low risk; could
  cross-check the payer info post-approval later.

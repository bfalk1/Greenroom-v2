import { test } from "node:test";
import assert from "node:assert/strict";
import { SUBSCRIPTION_TIERS, type TierName } from "./config";
import { PUBLIC_SUBSCRIPTION_PACKAGES } from "./publicPriceConfig";

// Drift guard. SUBSCRIPTION_TIERS.priceUsdCents seeds subscription_tiers in the
// DB (prisma/seed.ts) and is the Meta Pixel / CAPI Purchase value fallback, so
// it must equal the price shown on /pricing and charged by Stripe/PayPal. That
// price lives in PUBLIC_SUBSCRIPTION_PACKAGES. When these diverged (server said
// $10.99/$18.99 while /pricing charged $9.99/$17.99) every fallback-valued
// Purchase over-reported by $1 and biased ad optimization. This test fails the
// build the moment they drift again — update BOTH (and the provider dashboards)
// on any price change.
for (const name of Object.keys(SUBSCRIPTION_TIERS) as TierName[]) {
  const tier = SUBSCRIPTION_TIERS[name];
  const pkg = PUBLIC_SUBSCRIPTION_PACKAGES.find((p) => p.tierName === name);

  test(`tier ${name} has a matching public package`, () => {
    assert.ok(
      pkg,
      `SUBSCRIPTION_TIERS.${name} has no PUBLIC_SUBSCRIPTION_PACKAGES entry — the /pricing grid and the charged/seeded price would disagree`
    );
  });

  test(`tier ${name} price matches the displayed/charged price`, () => {
    assert.equal(
      tier.priceUsdCents,
      Math.round(pkg!.price * 100),
      `${name}: config.ts charges/seeds ${tier.priceUsdCents}¢ but /pricing shows $${pkg!.price} (${Math.round(
        pkg!.price * 100
      )}¢) — reconcile config.ts, publicPriceConfig, and the Stripe/PayPal dashboards together`
    );
  });

  test(`tier ${name} credits match the displayed package`, () => {
    assert.equal(
      tier.creditsPerMonth,
      pkg!.credits,
      `${name}: config.ts grants ${tier.creditsPerMonth} credits but /pricing advertises ${pkg!.credits}`
    );
  });
}

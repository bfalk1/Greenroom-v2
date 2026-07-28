/**
 * READ-ONLY audit: does every live Stripe subscription's DB tier match the tier
 * Stripe is actually billing?
 *
 * Mirrors the resolution the webhook and the reconcile cron use (env price map
 * → stable tier name → DB row), so what it reports is exactly what those paths
 * see. Writes NOTHING — no repairs, no grants. Repairs happen on the nightly
 * sweep (api/cron/stripe-subscriptions), which now compares tierId too.
 *
 * Why it exists: a tier change that customer.subscription.updated missed used
 * to be permanent — the sweep early-returned "ok" without comparing tierId, and
 * invoice.paid then granted the STALE tier's creditsPerMonth on every renewal.
 * Run this before/after deploying that fix, and any time the Stripe price IDs
 * are rotated.
 *
 * Usage (loads .env — i.e. whatever DATABASE_URL/STRIPE_SECRET_KEY it holds;
 * check the banner it prints before trusting the output):
 *   npx tsx scripts/audit-stripe-tier-drift.ts
 */
import "dotenv/config";
import Stripe from "stripe";
import { prisma } from "../src/lib/prisma";
import { SUBSCRIPTION_TIERS, tierNameForStripePrice } from "../src/lib/stripe/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

type Finding = {
  kind:
    | "MULTI_LIVE_SUB"
    | "TIER_DRIFT"
    | "NO_ROW"
    | "SUB_ID_MISMATCH"
    | "PROVIDER_MISMATCH"
    | "MISSING_GRANT_MARKER"
    | "UNRESOLVABLE_PRICE"
    | "UNATTRIBUTED";
  subId: string;
  status: string;
  userId?: string;
  email?: string;
  detail: string;
};

async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata) return fromMetadata;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const dbHost =
    process.env.DATABASE_URL?.match(/@([^:/]+)/)?.[1] ?? "(unparsed)";

  console.log("=== Stripe tier-drift audit (READ-ONLY) ===");
  console.log(
    `Stripe mode : ${key.startsWith("sk_live") ? "LIVE" : key.startsWith("sk_test") ? "TEST" : "UNKNOWN/UNSET"}`
  );
  console.log(`DB host     : ${dbHost}`);
  console.log("Price map   :");
  for (const name of Object.keys(SUBSCRIPTION_TIERS) as (keyof typeof SUBSCRIPTION_TIERS)[]) {
    const t = SUBSCRIPTION_TIERS[name];
    console.log(
      `  ${name.padEnd(3)} ${t.stripePriceId || "(UNSET — every price for this tier is unresolvable)"}`
    );
  }
  console.log("");

  const findings: Finding[] = [];
  let checked = 0;
  let ok = 0;

  // Gather grouped BY USER first, exactly like the reconcile cron does. Checking
  // subscriptions one at a time hides the worst case: two live subs for one
  // person each look individually consistent (or as a lone SUB_ID_MISMATCH),
  // while the customer is charged twice every period.
  const byUser = new Map<string, Stripe.Subscription[]>();
  for (const status of ["active", "past_due"] as const) {
    for await (const sub of stripe.subscriptions.list({ status, limit: 100 })) {
      checked += 1;
      const userId = await resolveUserId(sub);
      if (!userId) {
        findings.push({
          kind: "UNATTRIBUTED",
          subId: sub.id,
          status: sub.status,
          detail: "no metadata.userId and no user with this stripeCustomerId",
        });
        continue;
      }
      byUser.set(userId, [...(byUser.get(userId) ?? []), sub]);
    }
  }

  for (const [userId, subs] of byUser) {
    if (subs.length > 1) {
      const totalCents = subs.reduce(
        (n, s) => n + (s.items.data[0]?.price.unit_amount ?? 0),
        0
      );
      const who = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      findings.push({
        kind: "MULTI_LIVE_SUB",
        subId: subs.map((s) => s.id).join(" + "),
        status: subs.map((s) => s.status).join("/"),
        userId,
        email: who?.email,
        detail:
          `${subs.length} live Stripe subscriptions — DOUBLE BILLING at ` +
          `$${(totalCents / 100).toFixed(2)}/period. Next charges: ` +
          subs
            .map(
              (s) =>
                `${s.id} $${((s.items.data[0]?.price.unit_amount ?? 0) / 100).toFixed(2)} on ` +
                `${new Date(s.items.data[0].current_period_end * 1000).toISOString().slice(0, 10)}`
            )
            .join(", ") +
          ". The reconcile cron SKIPS this user entirely (manual review), so no" +
          " row/tier repair happens for them until it is resolved.",
      });
      continue;
    }

    {
      const sub = subs[0];
      const priceId = sub.items.data[0]?.price.id;
      const tierName = priceId ? tierNameForStripePrice(priceId) : null;
      const stripeTier = tierName
        ? await prisma.subscriptionTier.findFirst({
            where: { name: tierName, isActive: true },
          })
        : null;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          subscriptionStatus: true,
          subscription: { include: { tier: true } },
        },
      });

      if (!stripeTier) {
        findings.push({
          kind: "UNRESOLVABLE_PRICE",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail: `priceId=${priceId ?? "none"} → envTierName=${tierName ?? "none"}, dbRow=${tierName ? "missing/inactive" : "n/a"}`,
        });
        continue;
      }

      const row = user?.subscription;
      if (!row) {
        findings.push({
          kind: "NO_ROW",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail: `Stripe bills ${stripeTier.name} but the user has no subscription row`,
        });
        continue;
      }

      if (row.provider !== "stripe") {
        findings.push({
          kind: "PROVIDER_MISMATCH",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail: `live Stripe sub but row is owned by ${row.provider} (paypalSubscriptionId=${row.paypalSubscriptionId ?? "none"})`,
        });
        continue;
      }

      if (row.stripeSubscriptionId !== sub.id) {
        findings.push({
          kind: "SUB_ID_MISMATCH",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail: `row points at ${row.stripeSubscriptionId ?? "none"}`,
        });
        continue;
      }

      if (row.tierId !== stripeTier.id) {
        // The money line: what Stripe charges vs what renewals grant.
        const billedUsd = (stripeTier.priceUsdCents / 100).toFixed(2);
        const grantedUsd = (row.tier.priceUsdCents / 100).toFixed(2);
        findings.push({
          kind: "TIER_DRIFT",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail:
            `Stripe bills ${stripeTier.name} ($${billedUsd}, ${stripeTier.creditsPerMonth} cr/mo) ` +
            `but the row says ${row.tier.name} ($${grantedUsd}, ${row.tier.creditsPerMonth} cr/mo) — ` +
            `renewals grant ${row.tier.creditsPerMonth}, should grant ${stripeTier.creditsPerMonth}`,
        });
        continue;
      }

      // A live sub with a consistent row but NO `grant:<subId>` marker is a
      // duplicate credit grant waiting to happen: the sweep's early return
      // needs `rowCurrent && alreadyGranted`, so a missing marker falls through
      // to the grant block and re-credits a subscription the webhook already
      // paid. (Real occurrence: subscriptions created before the marker shipped
      // on 2026-07-13 were re-granted by the first sweep on 2026-07-14.)
      const marker = await prisma.stripeWebhookEvent.findUnique({
        where: { id: `grant:${sub.id}` },
        select: { id: true },
      });
      if (!marker) {
        findings.push({
          kind: "MISSING_GRANT_MARKER",
          subId: sub.id,
          status: sub.status,
          userId,
          email: user?.email,
          detail:
            `row is consistent but grant:${sub.id} is absent — the next reconcile ` +
            `sweep will grant ${stripeTier.creditsPerMonth} credits again`,
        });
        continue;
      }

      ok += 1;
    }
  }

  console.log(`Checked ${checked} live Stripe subscription(s): ${ok} consistent, ${findings.length} divergent.\n`);

  if (findings.length === 0) {
    console.log("No drift. Every live Stripe subscription's DB tier matches what Stripe bills.");
  } else {
    const byKind = new Map<string, Finding[]>();
    for (const f of findings) {
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    }
    // Ordered by money at stake: a customer charged twice comes before a
    // customer credited at the wrong rate, which comes before a stale row.
    const order = [
      "MULTI_LIVE_SUB",
      "TIER_DRIFT",
      "NO_ROW",
      "SUB_ID_MISMATCH",
      "PROVIDER_MISMATCH",
      "MISSING_GRANT_MARKER",
      "UNRESOLVABLE_PRICE",
      "UNATTRIBUTED",
    ];
    for (const kind of order) {
      const list = byKind.get(kind);
      if (!list?.length) continue;
      console.log(`--- ${kind} (${list.length}) ---`);
      for (const f of list) {
        console.log(
          `  ${f.subId} [${f.status}] ${f.email ?? f.userId ?? "?"}\n    ${f.detail}`
        );
      }
      console.log("");
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

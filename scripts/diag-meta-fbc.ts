// Must precede the prisma import — the client reads DATABASE_URL when it is
// constructed at import time, and Prisma Client (unlike the CLI) never loads
// .env itself. Next.js does this for the app; a bare tsx run does not.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Meta click-id (fbc) coverage diagnostic.
 *
 * Answers one question: is the durable-fbc fix actually recovering click ids,
 * or is it another no-op? Run it BEFORE the deploy to snapshot the baseline
 * (the checkout-capture section needs no new columns) and again a week after
 * to compare. Read-only — SELECTs only, safe against production.
 *
 *   npx tsx scripts/diag-meta-fbc.ts
 *
 * The fast falsification test is section 2: if barely any users have a click
 * id banked, the fallback has no fuel and nothing downstream can improve — you
 * know within days instead of waiting a month for conversion data.
 *
 * SCOPE LIMIT, stated up front: checkout_attributions rows are written by the
 * PAYPAL checkout only. Stripe's captured fbc lives in Stripe session metadata,
 * not this database, so section 3 measures the PayPal leg and is a proxy for
 * Stripe (both call the same capiAttributionFromRequest). Stripe is now the
 * majority provider — to measure it directly, list checkout sessions with a
 * restricted live key and count metadata.capiFbc.
 */

// Mirrors FBC_FORMAT / USER_FBC_MAX_AGE_MS in src/lib/metaCapiServer.ts.
const FBC_FORMAT = /^fb\.\d+\.\d+\.\S{1,400}$/;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pct = (n: number, d: number) =>
  d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;

function clickTimeMs(value: string | null): number {
  if (!value || !FBC_FORMAT.test(value)) return 0;
  const ms = Number(value.split(".")[2]);
  return Number.isFinite(ms) ? ms : 0;
}

/** The banking columns ship with this fix's migration; prod may not have them yet. */
async function bankingColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('meta_fbc', 'meta_fbc_updated_at')
  `;
  return rows.length === 2;
}

async function bankedFuelGauge(now: number) {
  console.log("\n=== 2. BANKED CLICK IDS (the fuel gauge) ===");

  const rows = await prisma.$queryRaw<
    { meta_fbc: string | null; meta_fbc_updated_at: Date | null }[]
  >`
    SELECT meta_fbc, meta_fbc_updated_at FROM users WHERE meta_fbc IS NOT NULL
  `;
  const [{ count: totalUsers }] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM users
  `;
  const total = Number(totalUsers);

  console.log(`users with a banked click id : ${rows.length} of ${total} (${pct(rows.length, total)})`);

  if (rows.length === 0) {
    console.log(
      "\n  >> NO CLICK IDS BANKED. If the fix has been deployed for a few days\n" +
        "     with live ad traffic, this is the falsification signal: /api/user/me\n" +
        "     is never seeing an _fbc/gr_fbc cookie. Check that ads are running and\n" +
        "     that buyers authenticate in the same browser as the ad click."
    );
    return;
  }

  // Usable = what withUserFbcFallback would actually send: well-formed, and
  // fresh on BOTH the bank stamp and the click time embedded in the value.
  let usable = 0;
  let malformed = 0;
  let staleClick = 0;
  let staleBank = 0;
  for (const r of rows) {
    if (!r.meta_fbc || !FBC_FORMAT.test(r.meta_fbc)) {
      malformed++;
      continue;
    }
    const bankedAt = r.meta_fbc_updated_at?.getTime();
    if (!bankedAt || now - bankedAt > MAX_AGE_MS) {
      staleBank++;
      continue;
    }
    if (now - clickTimeMs(r.meta_fbc) > MAX_AGE_MS) {
      staleClick++;
      continue;
    }
    usable++;
  }

  console.log(`  usable at checkout right now: ${usable} (${pct(usable, rows.length)} of banked)`);
  console.log(`  expired by click age (>90d)  : ${staleClick}`);
  console.log(`  expired by bank age (>90d)   : ${staleBank}`);
  console.log(`  malformed (should be 0)      : ${malformed}`);

  const banked7d = rows.filter(
    (r) => r.meta_fbc_updated_at && now - r.meta_fbc_updated_at.getTime() < 7 * DAY_MS
  ).length;
  const banked24h = rows.filter(
    (r) => r.meta_fbc_updated_at && now - r.meta_fbc_updated_at.getTime() < DAY_MS
  ).length;
  console.log(`  banked in last 24h / 7d      : ${banked24h} / ${banked7d}`);

  if (malformed > 0) {
    console.log(
      "\n  >> Malformed values are a BUG: normalizeFbc should reject them at the\n" +
        "     banking site in /api/user/me. Investigate before trusting the rest."
    );
  }
}

async function checkoutCapture() {
  console.log("\n=== 3. CHECKOUT CAPTURE RATE (PayPal leg; see scope limit in header) ===");

  const weekly = await prisma.$queryRaw<
    { week: Date; total: bigint; with_fbc: bigint; with_fbp: bigint; neither: bigint }[]
  >`
    SELECT date_trunc('week', created_at) AS week,
           count(*)::bigint                                          AS total,
           count(*) FILTER (WHERE fbc IS NOT NULL)::bigint           AS with_fbc,
           count(*) FILTER (WHERE fbp IS NOT NULL)::bigint           AS with_fbp,
           count(*) FILTER (WHERE fbc IS NULL AND fbp IS NULL)::bigint AS neither
    FROM checkout_attributions
    GROUP BY 1 ORDER BY 1
  `;

  if (weekly.length === 0) {
    console.log("no checkout_attributions rows yet");
    return;
  }

  console.log("week        | total | fbc | fbc%   | fbp | no cookies at all");
  let runTotal = 0;
  let runFbc = 0;
  for (const w of weekly) {
    const t = Number(w.total);
    const f = Number(w.with_fbc);
    runTotal += t;
    runFbc += f;
    console.log(
      `${w.week.toISOString().slice(0, 10)}  | ${String(t).padStart(5)} | ${String(f).padStart(3)} | ` +
        `${pct(f, t).padStart(6)} | ${String(Number(w.with_fbp)).padStart(3)} | ${Number(w.neither)}`
    );
  }
  console.log(`ALL TIME    | ${String(runTotal).padStart(5)} | ${String(runFbc).padStart(3)} | ${pct(runFbc, runTotal).padStart(6)}`);
  console.log(
    "\n  Baseline measured 2026-08-05 (pre-fix): 3/22 = 13.6% fbc, 59% fbp.\n" +
      "  Compare the weeks AFTER your deploy date against that."
  );
}

async function recoveryPotential(now: number) {
  console.log("\n=== 4. RECOVERY POTENTIAL (would the fallback have fired?) ===");

  // Checkouts that captured no fbc, whose user NOW has a usable banked id.
  // Approximate by design: only the LATEST banked value is stored, so this
  // cannot prove the id existed at that checkout's moment. Read it as "these
  // buyers now have a click id on file that a FUTURE fbc-less checkout would
  // recover" — a forward-looking rate, not a retroactive replay.
  const rows = await prisma.$queryRaw<
    {
      created_at: Date;
      meta_fbc: string | null;
      meta_fbc_updated_at: Date | null;
      banked_before_checkout: boolean;
    }[]
  >`
    SELECT ca.created_at,
           u.meta_fbc,
           u.meta_fbc_updated_at,
           (u.meta_fbc_updated_at IS NOT NULL
             AND u.meta_fbc_updated_at <= ca.created_at) AS banked_before_checkout
    FROM checkout_attributions ca
    JOIN users u ON u.id = ca.user_id
    WHERE ca.fbc IS NULL
  `;

  if (rows.length === 0) {
    console.log("no fbc-less checkouts on record — nothing to recover");
    return;
  }

  const usable = rows.filter((r) => {
    if (!r.meta_fbc || !FBC_FORMAT.test(r.meta_fbc)) return false;
    const bankedAt = r.meta_fbc_updated_at?.getTime();
    if (!bankedAt || now - bankedAt > MAX_AGE_MS) return false;
    return now - clickTimeMs(r.meta_fbc) <= MAX_AGE_MS;
  });
  const strict = usable.filter((r) => r.banked_before_checkout);

  console.log(`fbc-less checkouts on record        : ${rows.length}`);
  console.log(`  buyer now has a usable banked id  : ${usable.length} (${pct(usable.length, rows.length)})`);
  console.log(`  ...and it was banked BEFORE that checkout: ${strict.length} (${pct(strict.length, rows.length)})`);
  console.log(
    "\n  The second number is the honest one — those checkouts would have sent an\n" +
      "  fbc had the fallback been live. The first is the forward-looking ceiling."
  );
}

async function main() {
  const now = Date.now();
  console.log("Meta click-id (fbc) coverage diagnostic");
  console.log(`run at ${new Date(now).toISOString()}`);

  console.log("\n=== 1. MIGRATION STATE ===");
  const hasColumns = await bankingColumnsExist();
  if (!hasColumns) {
    console.log(
      "users.meta_fbc / meta_fbc_updated_at: NOT PRESENT\n" +
        "  The durable-fbc migration has not been applied to this database.\n" +
        "  Sections 2 and 4 are skipped; section 3 below is your PRE-FIX BASELINE —\n" +
        "  save this output and compare after the fix ships."
    );
    await checkoutCapture();
    console.log(
      "\nApply the migration before deploying the fix, or every full-row User\n" +
        "query fails with P2022:\n" +
        '  ALTER TABLE "users" ADD COLUMN "meta_fbc" TEXT;\n' +
        '  ALTER TABLE "users" ADD COLUMN "meta_fbc_updated_at" TIMESTAMP(3);'
    );
    return;
  }

  console.log("users.meta_fbc / meta_fbc_updated_at: present");
  await bankedFuelGauge(now);
  await checkoutCapture();
  await recoveryPotential(now);

  console.log(
    "\n=== WHERE TO LOOK IN META ===\n" +
      "  Events Manager's pixel overlay will NOT reflect this work: gr_fbc is\n" +
      "  httpOnly and the banked id is server-side, so neither can reach a browser\n" +
      "  event. Judge it on the CONVERSIONS API channel and the Event Match Quality\n" +
      "  score for Purchase / AddPaymentInfo."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

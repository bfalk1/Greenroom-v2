/**
 * End-to-end referral scenario runner — drives BOTH referral options through
 * the REAL production functions, with named test accounts, from signup to VIP
 * activation. Run against a THROWAWAY local Postgres only:
 *
 *   DATABASE_URL=postgresql://postgres:test@localhost:55433/greenroom_test \
 *   DIRECT_URL=$DATABASE_URL npx tsx scripts/referral-e2e-scenarios.ts
 *
 * The functions exercised are exactly the ones the app calls:
 *   - recordReferralForNewUser  → called by /callback and /api/user/me at signup
 *   - grantReferralRewardIfVip  → called by the Stripe/PayPal activation webhooks
 *   - getCreatorReferralCashCents → the payout unpaid-balance math
 */
import { prisma } from "../src/lib/prisma";
import {
  getOrCreateReferralCode,
  recordReferralForNewUser,
} from "../src/lib/referral";
import { grantReferralRewardIfVip } from "../src/lib/referralActivation";
import { getCreatorReferralCashCents } from "../src/lib/payouts";
import { randomUUID } from "crypto";

function line(s = "") {
  console.log(s);
}
function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function makeAccount(role: "USER" | "CREATOR", name: string) {
  const u = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${name.toLowerCase()}@referral-e2e.test`,
      username: name,
      role,
      isActive: true,
    },
  });
  return u;
}
async function balance(userId: string) {
  const r = await prisma.creditBalance.findUnique({ where: { userId } });
  return r?.balance ?? 0;
}
async function referralState(referredUserId: string) {
  const r = await prisma.referral.findUnique({ where: { referredUserId } });
  if (!r) return "none";
  return r.rewardedAt ? `REWARDED${r.referrerRewardSkippedReason ? ` (${r.referrerRewardSkippedReason})` : ""}` : "PENDING";
}
async function vipUnlocked(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { vipOfferUnlockedAt: true } });
  return u?.vipOfferUnlockedAt != null;
}

let failures = 0;
function check(label: string, ok: boolean) {
  line(`     ${ok ? "✓" : "✗ FAIL"}  ${label}`);
  if (!ok) failures++;
}

async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing to run: DATABASE_URL is not a localhost test DB");
  }

  // ══════════════════════════════════════════════════════════════════════
  line("\n╔══════════════════════════════════════════════════════════════════╗");
  line("║  SCENARIO A — USER → USER referral                                ║");
  line("║  (referrer is a normal user; both sides earn 100 credits)         ║");
  line("╚══════════════════════════════════════════════════════════════════╝");

  const alice = await makeAccount("USER", "Alice");
  const bob = await makeAccount("USER", "Bob");
  const aliceCode = await getOrCreateReferralCode(alice.id);
  line(`\n  Accounts:`);
  line(`     Alice  (referrer, USER)   referral code = ${aliceCode}`);
  line(`     Bob    (referred, USER)`);
  line(`     Alice's share link: /signup?ref=${aliceCode}`);

  line(`\n  Step 1 — Bob signs up via Alice's link  [recordReferralForNewUser]`);
  const recA = await recordReferralForNewUser({ code: aliceCode, newUserId: bob.id });
  line(`     referral recorded: ${recA.recorded}  •  state: ${await referralState(bob.id)}`);
  line(`     Bob credits: ${await balance(bob.id)}   Alice credits: ${await balance(alice.id)}`);
  check("no payout at signup (referral is PENDING)", (await referralState(bob.id)) === "PENDING");
  check("Bob and Alice both have 0 credits at signup", (await balance(bob.id)) === 0 && (await balance(alice.id)) === 0);

  line(`\n  Step 2 — Bob subscribes to GA (not VIP)  [grantReferralRewardIfVip tier=GA]`);
  await grantReferralRewardIfVip(bob.id, "GA", true, "webhook");
  line(`     state: ${await referralState(bob.id)}   Bob: ${await balance(bob.id)}   Alice: ${await balance(alice.id)}`);
  check("non-VIP subscription pays nothing (still PENDING)", (await referralState(bob.id)) === "PENDING" && (await balance(alice.id)) === 0);

  line(`\n  Step 3 — Bob's VIP checkout is still INCOMPLETE (not active yet)  [isActive=false]`);
  await grantReferralRewardIfVip(bob.id, "VIP", false, "webhook");
  line(`     state: ${await referralState(bob.id)}   Bob: ${await balance(bob.id)}   Alice: ${await balance(alice.id)}`);
  check("inactive VIP subscription pays nothing (still PENDING)", (await referralState(bob.id)) === "PENDING" && (await balance(alice.id)) === 0);

  line(`\n  Step 4 — Bob's VIP subscription goes ACTIVE  [grantReferralRewardIfVip tier=VIP isActive=true]`);
  await grantReferralRewardIfVip(bob.id, "VIP", true, "webhook");
  line(`     state: ${await referralState(bob.id)}   Bob: ${await balance(bob.id)}   Alice: ${await balance(alice.id)}`);
  check("referral is REWARDED", (await referralState(bob.id)) === "REWARDED");
  check("Bob (referred) received 100 credits", (await balance(bob.id)) === 100);
  check("Alice (referrer) received 100 credits", (await balance(alice.id)) === 100);

  line(`\n  Step 5 — a duplicate/renewal activation must NOT double-pay  [idempotency]`);
  await grantReferralRewardIfVip(bob.id, "VIP", true, "webhook");
  check("no double-pay on repeat activation", (await balance(bob.id)) === 100 && (await balance(alice.id)) === 100);

  // ══════════════════════════════════════════════════════════════════════
  line("\n\n╔══════════════════════════════════════════════════════════════════╗");
  line("║  SCENARIO B — CREATOR → USER referral                             ║");
  line("║  (referrer is a creator; creator earns a flat $10 payout,         ║");
  line("║   referred user gets the VIP lifetime discount, not credits)      ║");
  line("╚══════════════════════════════════════════════════════════════════╝");

  const casey = await makeAccount("CREATOR", "Casey");
  const dana = await makeAccount("USER", "Dana");
  const caseyCode = await getOrCreateReferralCode(casey.id);
  line(`\n  Accounts:`);
  line(`     Casey  (referrer, CREATOR)  referral code = ${caseyCode}`);
  line(`     Dana   (referred, USER)`);
  line(`     Casey's share link: /signup?ref=${caseyCode}`);

  line(`\n  Step 1 — Dana signs up via Casey's link  [recordReferralForNewUser]`);
  const recB = await recordReferralForNewUser({ code: caseyCode, newUserId: dana.id });
  line(`     referral recorded: ${recB.recorded}  •  state: ${await referralState(dana.id)}`);
  line(`     Dana VIP discount unlocked at signup? ${await vipUnlocked(dana.id)}`);
  line(`     Dana credits: ${await balance(dana.id)}   Casey referral cash: ${usd(await getCreatorReferralCashCents(casey.id))}`);
  check("referral PENDING at signup", (await referralState(dana.id)) === "PENDING");
  check("Dana's VIP discount is unlocked at signup (so she can buy VIP cheaper)", await vipUnlocked(dana.id));
  check("no payout to Casey at signup", (await getCreatorReferralCashCents(casey.id)) === 0);

  line(`\n  Step 2 — Dana's VIP subscription goes ACTIVE  [grantReferralRewardIfVip tier=VIP isActive=true]`);
  await grantReferralRewardIfVip(dana.id, "VIP", true, "webhook");
  const caseyCash = await getCreatorReferralCashCents(casey.id);
  line(`     state: ${await referralState(dana.id)}`);
  line(`     Dana credits: ${await balance(dana.id)}   Casey referral cash (payout): ${usd(caseyCash)}`);
  check("referral is REWARDED", (await referralState(dana.id)) === "REWARDED");
  check("Casey (creator) earned $10.00 in referral payout cash", caseyCash === 1000);
  check("Dana (referred) got the discount, NOT credits (0 credits)", (await balance(dana.id)) === 0);

  line(`\n  Step 3 — that $10 flows into Casey's real payout balance  [payout math]`);
  const before = await prisma.creatorPayout.aggregate({
    where: { creatorId: casey.id, status: { in: ["PAID", "PENDING"] } },
    _sum: { amountUsdCents: true },
  });
  const unpaid = caseyCash - (before._sum.amountUsdCents ?? 0);
  line(`     Casey unpaid referral earnings available for payout: ${usd(unpaid)}`);
  check("Casey's $10 referral cash is payable (unpaid balance)", unpaid === 1000);

  // ══════════════════════════════════════════════════════════════════════
  line("\n\n╔══════════════════════════════════════════════════════════════════╗");
  line("║  SUMMARY                                                          ║");
  line("╚══════════════════════════════════════════════════════════════════╝");
  line(`  Scenario A (user→user):   Alice +${await balance(alice.id)} credits,  Bob +${await balance(bob.id)} credits`);
  line(`  Scenario B (creator→user): Casey +${usd(await getCreatorReferralCashCents(casey.id))} payout,  Dana +${await balance(dana.id)} credits (has VIP discount)`);
  line(`  Both payouts fired ONLY on an active VIP subscription — never at signup,`);
  line(`  never on a non-VIP tier, never on an inactive/incomplete subscription.`);
  line(`\n  ${failures === 0 ? "ALL CHECKS PASSED ✓" : `${failures} CHECK(S) FAILED ✗`}\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Integration verification for the referral program, run against a THROWAWAY
 * local Postgres (never prod):
 *
 *   DATABASE_URL=postgresql://postgres:test@localhost:55433/greenroom_test \
 *   DIRECT_URL=$DATABASE_URL npx tsx scripts/verify-referral-flow.ts
 *
 * Two-phase lifecycle: record at signup (pending, no rewards), grant at VIP
 * activation. Exercises: code allocation, record (user + creator, VIP unlock,
 * no credits at signup), replay, grant on VIP activation (100/100 for user,
 * flat $10 for creator), grant idempotency, the 30-day expiry window, the
 * monthly cap at grant time (incl. concurrency), flat-rate reward, payout
 * integration, SET NULL anti-clawback, and self/unknown rejection.
 */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import {
  getOrCreateReferralCode,
  recordReferralForNewUser,
  grantReferralRewardOnVipActivation,
  getReferralStats,
} from "../src/lib/referral";
import { grantReferralRewardIfVip } from "../src/lib/referralActivation";
import { getCreatorReferralCashCents } from "../src/lib/payouts";
import { computeUnpaidCents } from "../src/lib/payoutMath";
import {
  MAX_REWARDED_REFERRALS_PER_MONTH,
  REFERRAL_REWARD_WINDOW_DAYS,
} from "../src/lib/referralCode";
import { randomUUID } from "crypto";

async function balance(userId: string): Promise<number> {
  const row = await prisma.creditBalance.findUnique({ where: { userId } });
  return row?.balance ?? 0;
}

async function makeUser(role: "USER" | "CREATOR", tag: string) {
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${tag}-${randomUUID().slice(0, 8)}@referral-test.local`,
      role,
      isActive: true,
    },
  });
}

async function isVipUnlocked(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { vipOfferUnlockedAt: true },
  });
  return u?.vipOfferUnlockedAt != null;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL is not a localhost test DB");
  }

  const referrerUser = await makeUser("USER", "referrer-user");
  const referrerCreator = await makeUser("CREATOR", "referrer-creator");

  // 1. Code allocation
  const userCode = await getOrCreateReferralCode(referrerUser.id);
  assert.match(userCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(await getOrCreateReferralCode(referrerUser.id), userCode);
  const creatorCode = await getOrCreateReferralCode(referrerCreator.id);
  console.log("✓ code allocation (idempotent, well-formed)");

  // 2. RECORD (user→user): pending row, NO credits granted at signup
  const referredU = await makeUser("USER", "referred-u");
  const rec1 = await recordReferralForNewUser({ code: userCode, newUserId: referredU.id });
  assert.equal(rec1.recorded, true);
  assert.equal(rec1.referredVipOffer, false);
  assert.equal(await balance(referredU.id), 0, "no credits at signup");
  assert.equal(await balance(referrerUser.id), 0, "no credits at signup");
  const row1 = await prisma.referral.findUnique({ where: { referredUserId: referredU.id } });
  assert.equal(row1?.rewardedAt, null, "referral is pending");
  console.log("✓ record user→user (pending, no credits granted at signup)");

  // 3. Replay record is a no-op
  const rec1b = await recordReferralForNewUser({ code: userCode, newUserId: referredU.id });
  assert.equal(rec1b.recorded, false);
  assert.equal(rec1b.reason, "already_recorded");
  console.log("✓ record replay is exactly-once");

  // 4. RECORD (creator→user): pending row + VIP unlock, NO credits
  const referredC = await makeUser("USER", "referred-c");
  const rec2 = await recordReferralForNewUser({ code: creatorCode, newUserId: referredC.id });
  assert.equal(rec2.recorded, true);
  assert.equal(rec2.referredVipOffer, true);
  assert.equal(await balance(referredC.id), 0, "no credits at signup");
  assert.equal(await isVipUnlocked(referredC.id), true, "creator-referred user is VIP-unlocked at signup");
  console.log("✓ record creator→user (pending, VIP unlock granted, no credits)");

  // 5. GRANT on VIP activation (user→user): both get 100 credits
  const g1 = await grantReferralRewardOnVipActivation(referredU.id);
  assert.equal(g1.granted, true);
  assert.equal(g1.referredCredits, 100);
  assert.equal(g1.referrerCredits, 100);
  assert.equal(g1.referrerCashCents, 0);
  assert.equal(await balance(referredU.id), 100);
  assert.equal(await balance(referrerUser.id), 100);
  const row1r = await prisma.referral.findUnique({ where: { referredUserId: referredU.id } });
  assert.ok(row1r?.rewardedAt != null, "referral is rewarded");
  console.log("✓ grant user→user on VIP activation (100 credits each)");

  // 6. GRANT on VIP activation (creator→user): creator gets flat $10, referred 0
  const g2 = await grantReferralRewardOnVipActivation(referredC.id);
  assert.equal(g2.granted, true);
  assert.equal(g2.referrerCashCents, 1000);
  assert.equal(g2.referredCredits, 0);
  assert.equal(await balance(referredC.id), 0, "creator-referred user gets no credits");
  assert.equal(await balance(referrerCreator.id), 0, "creator reward is cash, not credits");
  console.log("✓ grant creator→user on VIP activation (flat $10 cash, no credits)");

  // 7. Grant idempotency: a second activation doesn't double-pay. Once rewarded
  //    the cheap pre-check finds no pending row ("no_pending"); "already_resolved"
  //    is only the rarer in-tx race loss. Either way: not re-granted.
  const g1again = await grantReferralRewardOnVipActivation(referredU.id);
  assert.equal(g1again.granted, false);
  assert.ok(
    g1again.reason === "no_pending" || g1again.reason === "already_resolved",
    `expected idempotent no-grant, got ${g1again.reason}`
  );
  assert.equal(await balance(referredU.id), 100);
  assert.equal(await balance(referrerUser.id), 100);
  console.log("✓ grant is exactly-once (no double-pay on repeat activation)");

  // 7b. Payout happens ONLY for an ACTIVE VIP subscription: grantReferralRewardIfVip
  //     (the wrapper every activation path uses) withholds when the sub is not
  //     active, or when the tier isn't VIP — the referral stays pending, unpaid.
  const gateReferrer = await makeUser("USER", "gate-referrer");
  const gateCode = await getOrCreateReferralCode(gateReferrer.id);
  const gateReferred = await makeUser("USER", "gate-referred");
  await recordReferralForNewUser({ code: gateCode, newUserId: gateReferred.id });
  // Inactive VIP sub → nothing paid, referral still pending.
  await grantReferralRewardIfVip(gateReferred.id, "VIP", false, "webhook");
  assert.equal(await balance(gateReferred.id), 0, "inactive sub pays nothing");
  assert.equal(await balance(gateReferrer.id), 0, "inactive sub pays nothing");
  let gateRow = await prisma.referral.findUnique({ where: { referredUserId: gateReferred.id } });
  assert.equal(gateRow?.rewardedAt, null, "referral still pending after inactive sub");
  // Active but non-VIP tier → nothing paid, referral still pending.
  await grantReferralRewardIfVip(gateReferred.id, "AA", true, "webhook");
  assert.equal(await balance(gateReferred.id), 0, "non-VIP tier pays nothing");
  gateRow = await prisma.referral.findUnique({ where: { referredUserId: gateReferred.id } });
  assert.equal(gateRow?.rewardedAt, null, "referral still pending after non-VIP activation");
  // Active VIP sub → now it pays.
  await grantReferralRewardIfVip(gateReferred.id, "VIP", true, "webhook");
  assert.equal(await balance(gateReferred.id), 100, "active VIP pays");
  assert.equal(await balance(gateReferrer.id), 100, "active VIP pays");
  console.log("✓ payout only on ACTIVE VIP sub (inactive/non-VIP withheld, active VIP pays)");

  // 8. No pending referral → grant is a no-op
  const orphan = await makeUser("USER", "orphan");
  const gNone = await grantReferralRewardOnVipActivation(orphan.id);
  assert.equal(gNone.granted, false);
  assert.equal(gNone.reason, "no_pending");
  console.log("✓ non-referred VIP activation is a no-op");

  // 9. Expiry: a referral older than the window pays nothing on activation
  const lateReferrer = await makeUser("USER", "late-referrer");
  const lateReferred = await makeUser("USER", "late-referred");
  const old = new Date();
  old.setDate(old.getDate() - (REFERRAL_REWARD_WINDOW_DAYS + 5));
  await prisma.referral.create({
    data: {
      referrerId: lateReferrer.id,
      referredUserId: lateReferred.id,
      createdAt: old,
    },
  });
  const gLate = await grantReferralRewardOnVipActivation(lateReferred.id);
  assert.equal(gLate.granted, false);
  assert.equal(gLate.reason, "expired");
  assert.equal(await balance(lateReferred.id), 0);
  assert.equal(await balance(lateReferrer.id), 0);
  const lateRow = await prisma.referral.findUnique({ where: { referredUserId: lateReferred.id } });
  assert.ok(lateRow?.rewardedAt != null, "expired referral is terminally resolved");
  assert.equal(lateRow?.referrerRewardSkippedReason, "expired");
  console.log("✓ referral expires unrewarded past the 30-day window");

  // 9b. Window is measured against ACTIVATION time, not grant-execution time: a
  //     referral signed up 31 days ago whose VIP activation happened on day 29
  //     (within window) but is only granted now by a backstop must still PAY.
  const backstopReferrer = await makeUser("USER", "backstop-referrer");
  const backstopReferred = await makeUser("USER", "backstop-referred");
  const signedUp = new Date();
  signedUp.setDate(signedUp.getDate() - 31); // older than the raw window
  await prisma.referral.create({
    data: {
      referrerId: backstopReferrer.id,
      referredUserId: backstopReferred.id,
      createdAt: signedUp,
    },
  });
  const activatedInWindow = new Date(signedUp);
  activatedInWindow.setDate(activatedInWindow.getDate() + 29); // day 29 — within window
  const gBackstop = await grantReferralRewardOnVipActivation(
    backstopReferred.id,
    activatedInWindow
  );
  assert.equal(gBackstop.granted, true, "within-window activation paid despite late grant");
  assert.equal(await balance(backstopReferred.id), 100);
  assert.equal(await balance(backstopReferrer.id), 100);
  console.log("✓ window uses activation time, not grant time (late backstop still pays)");

  // 10. Flat $10 ignores custom payout rate
  await prisma.user.update({ where: { id: referrerCreator.id }, data: { customPayoutRate: 12 } });
  const referredC2 = await makeUser("USER", "referred-c2");
  await recordReferralForNewUser({ code: creatorCode, newUserId: referredC2.id });
  const g3 = await grantReferralRewardOnVipActivation(referredC2.id);
  assert.equal(g3.referrerCashCents, 1000, "flat $10 regardless of custom rate");
  console.log("✓ creator reward is flat $10 (ignores custom payout rate)");

  // 11. Payout integration: granted creator cash flows into the unpaid balance
  const cash = await getCreatorReferralCashCents(referrerCreator.id);
  assert.equal(cash, 2000); // two granted creator referrals × $10
  assert.equal(computeUnpaidCents(cash, 0), 2000);
  await prisma.creatorPayout.create({
    data: {
      creatorId: referrerCreator.id,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      totalCreditsSpent: 0,
      amountUsdCents: 2000,
      referralBonusCents: 2000,
      status: "PENDING",
    },
  });
  const accounted = await prisma.creatorPayout.aggregate({
    where: { creatorId: referrerCreator.id, status: { in: ["PAID", "PENDING"] } },
    _sum: { amountUsdCents: true },
  });
  assert.equal(computeUnpaidCents(cash, accounted._sum.amountUsdCents ?? 0), 0);
  console.log("✓ payout integration (granted cash → unpaid balance → accounted)");

  // 12. Self-referral and unknown codes rejected at record time
  const self = await recordReferralForNewUser({ code: userCode, newUserId: referrerUser.id });
  assert.equal(self.reason, "self_referral");
  const unknown = await recordReferralForNewUser({ code: "ZZZZZZZZ", newUserId: orphan.id });
  assert.equal(unknown.reason, "unknown_code");
  console.log("✓ self-referral and unknown codes rejected at record");

  // 13. Monthly cap at grant time: past the cap, referrer reward is withheld
  //     but the referred user still gets their credits.
  const capReferrer = await makeUser("USER", "cap-referrer");
  const capCode = await getOrCreateReferralCode(capReferrer.id);
  // Pre-seed the cap with already-rewarded referrals this month.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(12, 0, 0, 0);
  for (let i = 0; i < MAX_REWARDED_REFERRALS_PER_MONTH; i++) {
    const u = await makeUser("USER", `cap-seed-${i}`);
    await prisma.referral.create({
      data: {
        referrerId: capReferrer.id,
        referredUserId: u.id,
        rewardedAt: monthStart,
        referredCredits: 100,
        referrerCredits: 100,
      },
    });
  }
  const cappedReferred = await makeUser("USER", "capped-referred");
  await recordReferralForNewUser({ code: capCode, newUserId: cappedReferred.id });
  const gCap = await grantReferralRewardOnVipActivation(cappedReferred.id);
  assert.equal(gCap.granted, true);
  assert.equal(gCap.reason, "monthly_cap");
  assert.equal(gCap.referrerCredits, 0, "referrer reward withheld at cap");
  assert.equal(await balance(cappedReferred.id), 100, "referred user still gets credits");
  assert.equal(await balance(capReferrer.id), 0, "referrer got no extra credits");
  console.log("✓ monthly cap withholds referrer reward at grant, referred user still paid");

  // 14. Concurrency: pre-seed to cap−2, then grant a batch that straddles the
  //     boundary. The advisory lock must let exactly 2 more reward the referrer.
  const raceReferrer = await makeUser("USER", "race-referrer");
  const raceCode = await getOrCreateReferralCode(raceReferrer.id);
  for (let i = 0; i < MAX_REWARDED_REFERRALS_PER_MONTH - 2; i++) {
    const u = await makeUser("USER", `race-seed-${i}`);
    await prisma.referral.create({
      data: {
        referrerId: raceReferrer.id,
        referredUserId: u.id,
        rewardedAt: monthStart,
        referredCredits: 100,
        referrerCredits: 100,
      },
    });
  }
  const batch = 6; // 2 reward the referrer, 4 hit the cap
  const raceReferred = await Promise.all(
    Array.from({ length: batch }, (_, i) => makeUser("USER", `race-r-${i}`))
  );
  for (const u of raceReferred) {
    await recordReferralForNewUser({ code: raceCode, newUserId: u.id });
  }
  await Promise.all(
    raceReferred.map((u) => grantReferralRewardOnVipActivation(u.id))
  );
  const rewardedForReferrer = await prisma.referral.count({
    where: { referrerId: raceReferrer.id, referrerRewardSkippedReason: null, rewardedAt: { not: null } },
  });
  assert.equal(
    rewardedForReferrer,
    MAX_REWARDED_REFERRALS_PER_MONTH,
    `cap holds under concurrency (got ${rewardedForReferrer})`
  );
  console.log(`✓ cap holds under ${batch} concurrent grants (exactly ${MAX_REWARDED_REFERRALS_PER_MONTH} rewarded)`);

  // 15. SET NULL anti-clawback: deleting a rewarded referred user preserves the
  //     creator's earned cash.
  const cashBefore = await getCreatorReferralCashCents(referrerCreator.id);
  await prisma.user.delete({ where: { id: referredC.id } });
  const cashAfter = await getCreatorReferralCashCents(referrerCreator.id);
  assert.equal(cashAfter, cashBefore, "deleting a referred user must not claw back earned cash");
  console.log("✓ SET NULL anti-clawback (earned cash survives referred-user deletion)");

  // 16. Stats: totalReferrals = all signups; convertedReferrals = all that
  //     activated VIP (any resolved referral, incl. the capped ones).
  const totalRace = MAX_REWARDED_REFERRALS_PER_MONTH - 2 + batch; // 23 seeded + 6
  const stats = await getReferralStats(raceReferrer.id);
  assert.equal(stats.totalReferrals, totalRace);
  assert.equal(stats.convertedReferrals, totalRace, "all resolved referrals subscribed to VIP");
  console.log("✓ stats (totalReferrals=signups, convertedReferrals=VIP-subscribed)");

  console.log("\nAll referral integration checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

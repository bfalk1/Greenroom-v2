/**
 * One-off: create a logged-in-ready TEST BUYER account.
 *
 * Mints a Supabase auth user (email-confirmed) + matching Prisma User row, then
 * attaches an active GA subscription and a credit balance so the account can be
 * used to test browsing / purchasing / downloading immediately.
 *
 * Idempotent: re-running reuses the existing auth user and upserts everything.
 *
 * Override defaults with env vars:
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=secret npx tsx scripts/create-test-user.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail } from "../src/lib/email";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Refuse to touch a production environment by accident — this mints a real,
// email-confirmed auth user with a known password.
function assertSafeToSeed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    console.error("Refusing to run: NODE_ENV=production. Set ALLOW_PROD_SEED=1 to override.");
    process.exit(1);
  }
}

const EMAIL = normalizeEmail(process.env.TEST_EMAIL ?? "testuser@greenroom.fm");
const PASSWORD = process.env.TEST_PASSWORD ?? "greenroom2026";
const USERNAME = EMAIL.split("@")[0].replace(/[^a-z0-9]/g, "");

async function main() {
  assertSafeToSeed();
  console.log(`🧪 Creating test buyer: ${EMAIL}`);

  // 1. Supabase auth user (reuse if it already exists)
  let authUserId: string;
  const existingUser = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existingUser) {
    authUserId = existingUser.id;
    console.log("  ↺ Prisma user already exists — reusing auth id");
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      if (error.message.includes("already been registered")) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const found = users?.users.find((u) => normalizeEmail(u.email ?? "") === EMAIL);
        if (!found) throw new Error(`Auth user exists but could not be found: ${error.message}`);
        authUserId = found.id;
        // Reset to the known password so the account is usable.
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: PASSWORD });
        console.log("  ↺ Auth user already existed — password reset to known value");
      } else {
        throw error;
      }
    } else {
      authUserId = data.user.id;
      console.log("  ✅ Auth user created");
    }
  }

  // 2. Prisma User row (id must match the auth user id)
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { role: "USER", profileCompleted: true },
    create: {
      id: authUserId,
      email: EMAIL,
      username: USERNAME,
      fullName: "Test Buyer",
      role: "USER",
      profileCompleted: true,
    },
  });
  console.log("  ✅ User row ready");

  // 3. Active GA subscription
  const ga = await prisma.subscriptionTier.findUnique({ where: { name: "GA" } });
  if (!ga) throw new Error("GA tier not found — run `npx tsx prisma/seed.ts` first to seed tiers.");

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: { tierId: ga.id, currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
    create: { userId: user.id, tierId: ga.id, currentPeriodStart: now, currentPeriodEnd: periodEnd },
  });
  await prisma.user.update({ where: { id: user.id }, data: { subscriptionStatus: "active" } });
  console.log(`  ✅ Active ${ga.displayName} subscription (renews ${periodEnd.toISOString().slice(0, 10)})`);

  // 4. Credit balance = one month of GA credits
  await prisma.creditBalance.upsert({
    where: { userId: user.id },
    update: { balance: ga.creditsPerMonth },
    create: { userId: user.id, balance: ga.creditsPerMonth },
  });
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      amount: ga.creditsPerMonth,
      type: "SUBSCRIPTION",
      note: "Test account initial credit grant",
    },
  });
  console.log(`  ✅ Credit balance: ${ga.creditsPerMonth}`);

  console.log("\n🎉 Done. Login credentials:");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });

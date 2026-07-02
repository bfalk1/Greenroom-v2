import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Supabase admin client for creating auth users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Refuse to seed a production environment by accident — seeding mints real,
// email-confirmed auth users.
function assertSafeToSeed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
    console.error(
      "Refusing to seed: NODE_ENV=production. Set ALLOW_PROD_SEED=1 to override."
    );
    process.exit(1);
  }
}

async function main() {
  assertSafeToSeed();
  console.log("🌱 Seeding database...");

  // Upsert subscription tiers
  const tiers = [
    {
      name: "GA",
      displayName: "General Admission",
      creditsPerMonth: 100,
      priceUsdCents: 999,
      stripePriceId: "price_1Sx90A5k6Fwn7Cbz1uGYPTpZ",
    },
    {
      name: "VIP",
      displayName: "VIP",
      creditsPerMonth: 200,
      priceUsdCents: 1799,
      stripePriceId: "price_1Sx90Q5k6Fwn7CbzwN0qSyDO",
    },
    {
      name: "AA",
      displayName: "All Access",
      creditsPerMonth: 500,
      priceUsdCents: 3499,
      stripePriceId: "price_1Sx90e5k6Fwn7CbzYPkArchS",
    },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTier.upsert({
      where: { name: tier.name },
      update: {
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
        stripePriceId: tier.stripePriceId,
      },
      create: {
        name: tier.name,
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
        stripePriceId: tier.stripePriceId,
        isActive: true,
      },
    });
    console.log(`  ✅ Tier: ${tier.displayName} — $${(tier.priceUsdCents / 100).toFixed(2)}/mo, ${tier.creditsPerMonth} credits`);
  }

  // ─────────────────────────────────────────────
  // SEED CREATOR ACCOUNTS
  // ─────────────────────────────────────────────
  console.log("\n👤 Seeding creator accounts...");

  const creatorNames = [
    "Ekali", "Montell2099", "Dabow", "Lizdek", "Midnight Mafia", "Jawns",
    "Rickyxsan", "Cerdin", "Odea", "Juelz", "Control Freak", "SSOS",
    "Capshun", "Quix", "Tisoki", "Tynan", "Hekler", "Gravedgr",
    "Kumarion", "MSFT", "Blvde Runner", "Henry Fong", "Drezo", "ALRT",
    "Axel Boy", "Kompany", "Cyclops", "Jiqui", "Celo", "Brokn", "So Sus", "Badlike"
  ];

  const creators = creatorNames.map((name) => {
    const username = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return {
      email: `${username}@greenroom.fm`,
      username,
      artistName: name,
      role: "CREATOR" as const,
      bio: `Producer & artist`,
    };
  });

  let createdCount = 0;

  for (const c of creators) {
    // Unguessable per-account password. Artists claim their account via the
    // password-reset flow; nobody logs in with a seed-derived password.
    const password = randomBytes(32).toString("hex");
    let authUserId: string;
    
    const existingUser = await prisma.user.findUnique({ where: { email: c.email } });
    
    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: c.email,
        password,
        email_confirm: true,
      });
      
      if (authError) {
        if (authError.message.includes("already been registered")) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existing = users?.users.find(u => u.email === c.email);
          if (existing) {
            authUserId = existing.id;
          } else {
            console.error(`  ❌ Failed to create/find auth user for ${c.artistName}: ${authError.message}`);
            continue;
          }
        } else {
          console.error(`  ❌ Failed to create auth user for ${c.artistName}: ${authError.message}`);
          continue;
        }
      } else {
        authUserId = authData.user.id;
      }
    }
    
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        username: c.username,
        artistName: c.artistName,
        role: c.role,
        bio: c.bio,
        profileCompleted: true,
      },
      create: {
        id: authUserId,
        email: c.email,
        username: c.username,
        artistName: c.artistName,
        role: c.role,
        bio: c.bio,
        profileCompleted: true,
      },
    });

    await prisma.creatorApplication.upsert({
      where: { userId: user.id },
      update: { status: "APPROVED" },
      create: {
        userId: user.id,
        artistName: c.artistName,
        bio: c.bio,
        sampleZipUrl: "seeded-creator",
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });
    
    createdCount++;
    console.log(`  ✅ Creator: ${c.artistName} (${c.email})`);
  }

  console.log(`\n✅ Created ${createdCount} creators`);
  console.log("\n🎉 Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

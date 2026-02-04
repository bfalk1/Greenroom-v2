import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Upsert subscription tiers
  const tiers = [
    {
      name: "GA",
      displayName: "General Admission",
      creditsPerMonth: 100,
      priceUsdCents: 1099,
    },
    {
      name: "VIP",
      displayName: "VIP",
      creditsPerMonth: 200,
      priceUsdCents: 1899,
    },
    {
      name: "AA",
      displayName: "All Access",
      creditsPerMonth: 500,
      priceUsdCents: 3499,
    },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTier.upsert({
      where: { name: tier.name },
      update: {
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
      },
      create: {
        name: tier.name,
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
        isActive: true,
      },
    });
    console.log(`  ✅ Tier: ${tier.displayName} — $${(tier.priceUsdCents / 100).toFixed(2)}/mo, ${tier.creditsPerMonth} credits`);
  }

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

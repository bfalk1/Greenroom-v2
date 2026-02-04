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
      stripePriceId: "price_1Sv50uIWJCIyCVNS2v5Vrdl1",
    },
    {
      name: "VIP",
      displayName: "VIP",
      creditsPerMonth: 200,
      priceUsdCents: 1899,
      stripePriceId: "price_1Sv50uIWJCIyCVNSnYOFdlgc",
    },
    {
      name: "AA",
      displayName: "All Access",
      creditsPerMonth: 500,
      priceUsdCents: 3499,
      stripePriceId: "price_1Sv50uIWJCIyCVNSS8KxUBnd",
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

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function reset() {
  console.log("🧹 Cleaning up old test creators...");
  
  // Get sample IDs from test creators
  const samples = await prisma.sample.findMany({
    where: { creator: { email: { endsWith: "@greenroom.fm" } } },
    select: { id: true }
  });
  const sampleIds = samples.map(s => s.id);
  
  if (sampleIds.length > 0) {
    // Delete related records first
    await prisma.download.deleteMany({ where: { sampleId: { in: sampleIds } } });
    await prisma.purchase.deleteMany({ where: { sampleId: { in: sampleIds } } });
    await prisma.rating.deleteMany({ where: { sampleId: { in: sampleIds } } });
    await prisma.favorite.deleteMany({ where: { sampleId: { in: sampleIds } } });
    
    // Then delete samples
    const deleted = await prisma.sample.deleteMany({
      where: { id: { in: sampleIds } }
    });
    console.log(`  Deleted ${deleted.count} samples`);
  }
  
  // Delete test users
  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { endsWith: "@greenroom.fm" } }
  });
  console.log(`  Deleted ${deletedUsers.count} users`);
  
  console.log("✅ Cleanup done");
  await prisma.$disconnect();
}

reset();

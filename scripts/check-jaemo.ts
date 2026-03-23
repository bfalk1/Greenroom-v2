import { prisma } from '../src/lib/prisma'

async function main() {
  // Find recent users
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, email: true, role: true, artistName: true, username: true, createdAt: true }
  })
  console.log('Recent users:', JSON.stringify(users, null, 2))
  
  // Find recent invites
  const invites = await prisma.creatorInvite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { email: true, artistName: true, usedAt: true, usedByUserId: true, expiresAt: true }
  })
  console.log('Recent invites:', JSON.stringify(invites, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())

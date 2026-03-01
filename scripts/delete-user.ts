#!/usr/bin/env npx tsx
/**
 * Delete a user and all related data
 * Usage: npx tsx scripts/delete-user.ts <user-id-or-email>
 */

import { prisma } from '../src/lib/prisma'

async function deleteUser(identifier: string) {
  // Find user by ID or email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: identifier },
        { email: identifier },
      ],
    },
  })

  if (!user) {
    console.error(`❌ User not found: ${identifier}`)
    process.exit(1)
  }

  console.log(`Found user: ${user.email} (${user.id})`)
  console.log(`Name: ${user.fullName || user.artistName || 'N/A'}`)
  console.log(`Role: ${user.role}`)
  console.log('')

  // Confirm deletion
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const confirm = await new Promise<string>((resolve) => {
    rl.question('⚠️  Delete this user and all related data? (yes/no): ', resolve)
  })
  rl.close()

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.')
    process.exit(0)
  }

  console.log('\nDeleting user data...')

  // Delete in order to respect foreign key constraints
  // Tables without onDelete: Cascade need manual deletion

  // 1. Audit logs (actor_id references user)
  const auditLogs = await prisma.auditLog.deleteMany({
    where: { actorId: user.id },
  })
  console.log(`  - Deleted ${auditLogs.count} audit logs`)

  // 2. Creator payout summaries
  const payouts = await prisma.creatorPayoutSummary.deleteMany({
    where: { creatorId: user.id },
  })
  console.log(`  - Deleted ${payouts.count} payout summaries`)

  // 3. Invite codes (both as inviter and usedBy)
  const inviteCodes = await prisma.inviteCode.deleteMany({
    where: {
      OR: [{ invitedBy: user.id }, { usedByUserId: user.id }],
    },
  })
  console.log(`  - Deleted ${inviteCodes.count} invite codes`)

  // 4. Creator applications (as reviewer)
  await prisma.creatorApplication.updateMany({
    where: { reviewedBy: user.id },
    data: { reviewedBy: null },
  })
  console.log(`  - Cleared reviewer from creator applications`)

  // 5. Samples (creator_id references user) - this cascades to:
  //    - SampleDownload, SamplePlay, SampleLike, Purchase
  const samples = await prisma.sample.deleteMany({
    where: { creatorId: user.id },
  })
  console.log(`  - Deleted ${samples.count} samples (and related downloads/plays/likes/purchases)`)

  // 6. Delete the user (cascades to: subscriptions, credit_balances, 
  //    credit_transactions, follows, creator_applications)
  await prisma.user.delete({
    where: { id: user.id },
  })

  console.log(`\n✅ User ${user.email} deleted successfully`)
}

const identifier = process.argv[2]
if (!identifier) {
  console.error('Usage: npx tsx scripts/delete-user.ts <user-id-or-email>')
  process.exit(1)
}

deleteUser(identifier)
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

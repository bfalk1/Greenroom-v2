/**
 * Targeted payout queue for the 42 on-time-upload-bonus creators ONLY.
 *
 * Mirrors src/app/api/cron/monthly-payouts/route.ts exactly — same period
 * label (previous full calendar month), same all-time-unpaid catch-up amount,
 * same accounting (subtract PAID + PENDING), same referral split, same
 * processing fee, same per-row invoice number — but restricted to the creators
 * who received the bonus, so it does NOT queue every eligible creator the way
 * the full cron would. Reuses the shared payout helpers so the math can't drift
 * from the cron/dashboard.
 *
 * Creates PENDING CreatorPayout rows (an admin still approves each disbursement;
 * no money moves here). Idempotent: skips a creator who already has a payout for
 * this period, so a second run won't double-queue. Read-only until --apply.
 *
 * Usage:
 *   npx tsx scripts/queue-bonus-payouts.ts            # dry run (writes nothing)
 *   npx tsx scripts/queue-bonus-payouts.ts --apply    # create the PENDING rows
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import {
  calculateCreatorEarningsCents,
  getCreatorCreditsSpent,
  getCreatorReferralCashCents,
  getCreatorAdjustmentCents,
  getPayoutFeeConfig,
  nextPayoutInvoiceNumber,
} from '../src/lib/payouts'
import {
  computeUnpaidCents,
  computeProcessingFeeCents,
  computeNetPayoutCents,
  MIN_PAYOUT_CENTS,
} from '../src/lib/payoutMath'

const REASON = 'On-time sample upload bonus — 2026-07'
const APPLY = process.argv.includes('--apply')

async function main() {
  // Authoritative target set = whoever holds the bonus adjustment row.
  const adjustments = await prisma.creatorEarningAdjustment.findMany({
    where: { reason: REASON },
    select: {
      creatorId: true,
      creator: { select: { email: true, artistName: true, role: true, isActive: true } },
    },
  })
  const targets = [...new Map(adjustments.map((a) => [a.creatorId, a.creator])).entries()]

  // Period label = previous full calendar month — IDENTICAL to the cron, so a
  // later cron run reconciles against these rows instead of re-queuing.
  const now = new Date()
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1)
  periodEnd.setMilliseconds(-1)
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1)

  const feeConfig = await getPayoutFeeConfig()
  const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n)

  type Row = {
    creatorId: string
    label: string
    action: 'QUEUE' | 'SKIP_EXISTING' | 'BELOW_MIN' | 'INACTIVE'
    grossCents?: number
    feeCents?: number
    netCents?: number
    credits?: number
    referralCents?: number
  }
  const rows: Row[] = []

  for (const [creatorId, creator] of targets) {
    const label = creator.artistName || creator.email
    if (creator.role !== 'CREATOR' || !creator.isActive) {
      rows.push({ creatorId, label, action: 'INACTIVE' })
      continue
    }

    // Don't queue a second payout for the same generation period.
    const existing = await prisma.creatorPayout.findFirst({
      where: { creatorId, periodStart, periodEnd },
      select: { id: true },
    })
    if (existing) {
      rows.push({ creatorId, label, action: 'SKIP_EXISTING' })
      continue
    }

    // Accounted = everything already PAID or PENDING.
    const accounted = await prisma.creatorPayout.findMany({
      where: { creatorId, status: { in: ['PAID', 'PENDING'] } },
      select: { amountUsdCents: true, totalCreditsSpent: true, referralBonusCents: true },
    })
    const accountedCents = accounted.reduce((s, p) => s + p.amountUsdCents, 0)
    const accountedCredits = accounted.reduce((s, p) => s + p.totalCreditsSpent, 0)
    const accountedReferralCents = accounted.reduce((s, p) => s + p.referralBonusCents, 0)

    const totalCredits = await getCreatorCreditsSpent(creatorId)
    const catalogCents = await calculateCreatorEarningsCents(creatorId, totalCredits)
    const referralCents = await getCreatorReferralCashCents(creatorId)
    const adjustmentCents = await getCreatorAdjustmentCents(creatorId)
    const totalEarningsCents = catalogCents + referralCents + adjustmentCents

    const unpaidCents = computeUnpaidCents(totalEarningsCents, accountedCents)
    const unpaidCredits = Math.max(0, totalCredits - accountedCredits)
    const unpaidReferralCents = Math.min(
      unpaidCents,
      computeUnpaidCents(referralCents, accountedReferralCents)
    )

    if (unpaidCents < MIN_PAYOUT_CENTS) {
      rows.push({ creatorId, label, action: 'BELOW_MIN', grossCents: unpaidCents })
      continue
    }

    const feeCents = computeProcessingFeeCents(unpaidCents, feeConfig.feeBps, feeConfig.feeFixedCents)
    rows.push({
      creatorId,
      label,
      action: 'QUEUE',
      grossCents: unpaidCents,
      feeCents,
      netCents: computeNetPayoutCents(unpaidCents, feeCents),
      credits: unpaidCredits,
      referralCents: unpaidReferralCents,
    })
  }

  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} — queue bonus payouts ===`)
  console.log(`Period: ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}\n`)
  for (const r of rows) {
    const money = r.grossCents != null
      ? `gross $${(r.grossCents / 100).toFixed(2)}${r.netCents != null ? `  net $${(r.netCents / 100).toFixed(2)}` : ''}`
      : ''
    console.log(`${pad(r.label, 18)} ${pad(r.action, 14)} ${money}`)
  }

  const toQueue = rows.filter((r) => r.action === 'QUEUE')
  const grossTotal = toQueue.reduce((s, r) => s + (r.grossCents ?? 0), 0)
  const netTotal = toQueue.reduce((s, r) => s + (r.netCents ?? 0), 0)
  console.log('\n=== SUMMARY ===')
  console.log(`Targets            : ${rows.length}`)
  console.log(`Will queue         : ${toQueue.length}  (gross $${(grossTotal / 100).toFixed(2)}, net $${(netTotal / 100).toFixed(2)})`)
  console.log(`Already queued     : ${rows.filter((r) => r.action === 'SKIP_EXISTING').length}`)
  console.log(`Below $${(MIN_PAYOUT_CENTS / 100).toFixed(0)} minimum   : ${rows.filter((r) => r.action === 'BELOW_MIN').length}`)
  console.log(`Inactive/non-creator: ${rows.filter((r) => r.action === 'INACTIVE').length}`)

  if (!APPLY) {
    console.log('\n(dry run — nothing written. Re-run with --apply to queue.)')
    return
  }

  // Create rows one at a time — each pulls its own invoice number from the
  // payout_invoice_seq sequence (matches the cron; sequences are non-txn).
  let created = 0
  for (const r of toQueue) {
    const invoiceNumber = await nextPayoutInvoiceNumber()
    await prisma.creatorPayout.create({
      data: {
        creatorId: r.creatorId,
        periodStart,
        periodEnd,
        totalCreditsSpent: r.credits ?? 0,
        amountUsdCents: r.grossCents ?? 0,
        referralBonusCents: r.referralCents ?? 0,
        processingFeeCents: r.feeCents ?? 0,
        invoiceNumber,
        status: 'PENDING',
      },
    })
    created++
    console.log(`✔ queued ${r.label}: gross $${((r.grossCents ?? 0) / 100).toFixed(2)} (${invoiceNumber})`)
  }
  console.log(`\n✔ Queued ${created} PENDING payouts (gross $${(grossTotal / 100).toFixed(2)}). Approve them in the admin dashboard.`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())

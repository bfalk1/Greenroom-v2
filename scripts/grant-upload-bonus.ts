/**
 * One-off grant: a flat $200 on-time-sample-upload bonus to a fixed list of
 * creators. Writes one CreatorEarningAdjustment row per creator, which the
 * payout pipeline sweeps into their next PENDING payout (admin still approves
 * the disbursement — this only increases what's OWED).
 *
 * Targets are keyed by EMAIL (unique + unambiguous) rather than artist name, so
 * there's no fuzzy matching: WATASHI's coincidental second account and XUST's
 * trailing-period artist name are both sidestepped.
 *
 * Idempotent: a creator who already has an adjustment with this exact REASON is
 * skipped, so re-running never double-grants. Read-only until --apply.
 *
 * Usage:
 *   npx tsx scripts/grant-upload-bonus.ts            # dry run (writes nothing)
 *   npx tsx scripts/grant-upload-bonus.ts --apply    # perform the grant
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const AMOUNT_CENTS = 20000 // $200.00
const REASON = 'On-time sample upload bonus — 2026-07'
const APPLY = process.argv.includes('--apply')

// name is for the human-readable report only; email is the resolution key.
const TARGETS: { name: string; email: string }[] = [
  { name: 'KNOIR', email: 'knoir.tunes@gmail.com' },
  { name: 'YZENIA', email: 'yzeniamusic@gmail.com' },
  { name: 'CURE97', email: 'info@cure97.com' },
  { name: 'DABOW (RE-ENTRY)', email: 'dabowmusic@gmail.com' },
  { name: 'MIRZHA', email: 'mirzhamusic@gmail.com' },
  { name: 'XUMA', email: 'xumamusic.contact@gmail.com' },
  { name: 'TRSTN', email: 'contact.trstnmusic@gmail.com' },
  { name: 'VISTUH', email: 'vistuh.music@gmail.com' },
  { name: 'WATASHI', email: 'watashisound@gmail.com' },
  { name: 'NO DISTRACTIONS', email: 'music.nodistractions@gmail.com' },
  { name: 'BROMAD', email: 'stefan@splendidaustralia.com.au' },
  { name: 'STROBEZ', email: 'strobezmusic@gmail.com' },
  { name: 'XUST.', email: 'xustmusic@gmail.com' },
  { name: 'XERXES', email: 'xerxesmusicofficial@gmail.com' },
  { name: 'ODD LANGUAGE', email: 'oddlanguagemusic@gmail.com' },
  { name: '7THSIGNAL', email: 'samuelkroshus@proton.me' },
  { name: 'AKIRA KHAN', email: 'akiraspromos@gmail.com' },
  { name: 'SVRGXON', email: 'svrgxondubz@gmail.com' },
  { name: 'CRIMSON CHILD', email: 'yashartafazoli@gmail.com' },
  { name: 'ELLISAY', email: 'ellisayofficial@gmail.com' },
  { name: 'SYSTEM KIDS', email: 'jackhoodmail@gmail.com' },
  { name: 'VARI', email: 'vari@varimusic.com' },
  { name: 'BURDA', email: 'burda0212@gmail.com' },
  { name: 'ETERNAL', email: 'eternalmusicmgmt@gmail.com' },
  { name: 'JADE SIERRA', email: 'john@yakana.net' },
  { name: 'N8LAND', email: 'n8landmusic@gmail.com' },
  { name: 'DEJA', email: 'iamdejaofficial@gmail.com' },
  { name: 'WRON', email: 'hiimwron@gmail.com' },
  { name: 'MOLDAE', email: 'moldaemusic@gmail.com' },
  { name: 'BAUTI', email: 'info.bautimusic@gmail.com' },
  { name: 'OUTLO', email: 'itsoutlo@gmail.com' },
  { name: 'HUZLE', email: 'huzlebeats@gmail.com' },
  { name: 'JOEBUK', email: 'joebukofficial@outlook.com' },
  { name: 'KIZBY', email: 'midou.kchaou120@gmail.com' },
  { name: 'LINGOTURBO', email: 'lingoanything61@gmail.com' },
  { name: 'FELMAX', email: 'felmaxofficial@gmail.com' },
  { name: 'SKZY', email: 'skzymusic@gmail.com' },
  { name: 'DANIEL YIZI', email: 'dyi0531@gmail.com' },
  { name: 'SKYLER', email: 'skylerxsounds@gmail.com' },
  { name: 'SADRN', email: 'sadrnsounds@gmail.com' },
  { name: 'JASPA', email: 'japsamusic@gmail.com' },
  { name: 'HYRI', email: 'hyribeats@gmail.com' },
]

type Plan = {
  name: string
  email: string
  userId: string | null
  role: string | null
  action: 'GRANT' | 'SKIP_EXISTING' | 'NOT_FOUND' | 'NOT_CREATOR'
}

async function main() {
  const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n)
  const plans: Plan[] = []

  // The adjustments table may not be migrated yet (dry run can precede the
  // prod migration). Probe once; if absent, skip the idempotency check and
  // treat every target as a first-time grant for display purposes.
  let adjTableReady = true
  try {
    await prisma.creatorEarningAdjustment.count()
  } catch {
    adjTableReady = false
  }

  for (const t of TARGETS) {
    const email = t.email.trim().toLowerCase()
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    })

    if (!user) {
      plans.push({ ...t, userId: null, role: null, action: 'NOT_FOUND' })
      continue
    }
    if (user.role !== 'CREATOR') {
      plans.push({ ...t, userId: user.id, role: user.role, action: 'NOT_CREATOR' })
      continue
    }

    const existing = adjTableReady
      ? await prisma.creatorEarningAdjustment.findFirst({
          where: { creatorId: user.id, reason: REASON },
          select: { id: true },
        })
      : null
    plans.push({
      ...t,
      userId: user.id,
      role: user.role,
      action: existing ? 'SKIP_EXISTING' : 'GRANT',
    })
  }

  console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY RUN'} — $${(AMOUNT_CENTS / 100).toFixed(2)} bonus ===`)
  console.log(`Reason: "${REASON}"`)
  if (!adjTableReady) console.log('NOTE: adjustments table not migrated yet — showing all as first-time grants.\n')
  else console.log('')
  for (const p of plans) {
    console.log(`${pad(p.name, 18)} ${pad(p.email, 34)} ${pad(p.action, 14)} ${p.role ?? ''}`)
  }

  const toGrant = plans.filter((p) => p.action === 'GRANT')
  const skipExisting = plans.filter((p) => p.action === 'SKIP_EXISTING')
  const notFound = plans.filter((p) => p.action === 'NOT_FOUND')
  const notCreator = plans.filter((p) => p.action === 'NOT_CREATOR')

  console.log('\n=== SUMMARY ===')
  console.log(`Targets            : ${plans.length}`)
  console.log(`Will grant         : ${toGrant.length}  ($${((toGrant.length * AMOUNT_CENTS) / 100).toFixed(2)})`)
  console.log(`Already granted    : ${skipExisting.length} (idempotent skip)`)
  console.log(`NOT FOUND          : ${notFound.length}${notFound.length ? ' -> ' + notFound.map((p) => p.name).join(', ') : ''}`)
  console.log(`Not a CREATOR      : ${notCreator.length}${notCreator.length ? ' -> ' + notCreator.map((p) => p.name).join(', ') : ''}`)

  // Safety: never do a partial money grant when the list has an unresolved
  // target — a typo shouldn't silently drop someone or hit the wrong account.
  if (notFound.length > 0 || notCreator.length > 0) {
    console.log('\n✖ Refusing to apply: resolve NOT_FOUND / NOT_CREATOR entries first.')
    if (APPLY) process.exitCode = 1
    return
  }

  if (!APPLY) {
    console.log('\n(dry run — nothing written. Re-run with --apply to grant.)')
    return
  }

  if (!adjTableReady) {
    console.log('\n✖ Refusing to apply: the creator_earning_adjustments table does not exist yet. Run the migration first.')
    process.exitCode = 1
    return
  }

  // Atomic: all grants in one transaction.
  await prisma.$transaction(
    toGrant.map((p) =>
      prisma.creatorEarningAdjustment.create({
        data: {
          creatorId: p.userId!,
          amountUsdCents: AMOUNT_CENTS,
          reason: REASON,
        },
      })
    )
  )
  console.log(`\n✔ Granted $${(AMOUNT_CENTS / 100).toFixed(2)} to ${toGrant.length} creators ($${((toGrant.length * AMOUNT_CENTS) / 100).toFixed(2)} total).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

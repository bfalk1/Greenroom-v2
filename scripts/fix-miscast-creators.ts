/**
 * One-off remediation for creators who accepted a valid invite but were created
 * as plain USERs because their invite email was stored with mixed case (see the
 * normalizeEmail fix + 20260625000000_lowercase_invite_emails migration).
 *
 * For each affected artist name this:
 *   1. finds the CreatorInvite (the artist name lives on the invite, not the user)
 *   2. resolves the user by the invite email, CASE-INSENSITIVELY (the user row is
 *      lowercased by Supabase; the invite row may be mixed case)
 *   3. upgrades the user to CREATOR (mirrors src/app/api/user/me/route.ts:160-195)
 *   4. marks the invite used, and creates the auto-approved CreatorApplication if
 *      one doesn't already exist
 *
 * Idempotent: re-running skips anyone already CREATOR/ADMIN and never duplicates
 * an application. Works whether or not the lowercase-emails migration has run.
 *
 * Usage:
 *   npx tsx scripts/fix-miscast-creators.ts            # dry run (read-only report)
 *   npx tsx scripts/fix-miscast-creators.ts --apply    # perform the upgrades
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

// Prefer .env.local if present, otherwise fall back to .env.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

// Artist names of the accounts that went through as USER instead of CREATOR.
const AFFECTED = ["Watashi", "Kizby", "SADRN"];

async function fixOne(artistName: string) {
  // The artist name is on the invite (the user row never got it, because the
  // invite match that would have set it is exactly what failed).
  const invite = await prisma.creatorInvite.findFirst({
    where: { artistName },
    orderBy: { createdAt: "desc" },
  });

  if (!invite) {
    console.log(`✗ ${artistName}: no CreatorInvite found — skipping (resolve email manually)`);
    return;
  }

  // The user row is lowercased; the invite email may be mixed case. Match loosely.
  const user = await prisma.user.findFirst({
    where: { email: { equals: invite.email, mode: "insensitive" } },
  });

  if (!user) {
    console.log(`✗ ${artistName}: no user for invite email ${invite.email} — skipping`);
    return;
  }

  if (user.role === "CREATOR" || user.role === "ADMIN") {
    console.log(`• ${artistName}: already ${user.role} (${user.email}) — nothing to do`);
    return;
  }

  const existingApp = await prisma.creatorApplication.findUnique({
    where: { userId: user.id },
  });

  // User.artistName is @unique. Only set it if it's free, so we never abort the
  // whole upgrade on a name collision — the role is what matters most.
  const nameTaken = await prisma.user.findFirst({
    where: { artistName: invite.artistName, id: { not: user.id } },
    select: { id: true },
  });
  const setArtistName = !user.artistName && !nameTaken;

  console.log(
    `→ ${artistName}: ${user.email} role ${user.role} → CREATOR` +
      `${setArtistName ? `, set artistName="${invite.artistName}"` : ""}` +
      `${nameTaken && !user.artistName ? ` (artistName "${invite.artistName}" already taken — leaving null)` : ""}` +
      `${invite.usedAt ? "" : ", mark invite used"}` +
      `${existingApp ? " (application already exists)" : ", create approved application"}`
  );

  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        role: "CREATOR",
        ...(setArtistName ? { artistName: invite.artistName } : {}),
      },
    });

    if (!invite.usedAt) {
      await tx.creatorInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedByUserId: user.id },
      });
    }

    if (!existingApp) {
      await tx.creatorApplication.create({
        data: {
          userId: user.id,
          artistName: invite.artistName || "Invited Creator",
          sampleZipUrl: "",
          status: "APPROVED",
          reviewNote: "Auto-approved via admin invite (case-mismatch remediation)",
          reviewedAt: new Date(),
          termsAcceptedAt: new Date(),
        },
      });
    }
  });

  console.log(`  ✓ ${artistName} upgraded`);
}

async function main() {
  console.log(
    apply
      ? "Fixing miscast creators (APPLYING changes)…\n"
      : "Fixing miscast creators (dry run — no writes)…\n"
  );

  for (const name of AFFECTED) {
    try {
      await fixOne(name);
    } catch (err) {
      console.error(`✗ ${name}: failed —`, err);
    }
  }

  console.log(
    apply
      ? "\nDone."
      : "\nDry run only. Re-run with --apply to perform the upgrades."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

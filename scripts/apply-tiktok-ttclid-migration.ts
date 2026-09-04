/**
 * Applies the tiktok_ttclid migration to a target database.
 *
 * Same shape as scripts/apply-audio-scan-migration.ts and for the same
 * reason: prod's migration history has DIVERGED from the repo, so
 * `prisma migrate deploy` would drag unrelated migrations along. This script
 * applies an explicit allowlist (one migration), records it in
 * _prisma_migrations, and refuses to touch anything else. Safe to re-run.
 *
 * The DDL is two additive, nullable ADD COLUMNs — no rewrite, no lock of
 * consequence on Postgres, and existing rows simply have nothing banked yet.
 *
 * Dry run first (prints the plan, touches nothing):
 *   npx tsx scripts/apply-tiktok-ttclid-migration.ts
 *
 * Then apply, naming the host you intend to hit:
 *   npx tsx scripts/apply-tiktok-ttclid-migration.ts --apply --confirm-host=aws-1-us-east-1.pooler.supabase.com
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIGRATION = "20260904000000_add_user_tiktok_ttclid";
const COLUMNS = ["tiktok_ttclid", "tiktok_ttclid_updated_at"];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const confirmHost = args.find((a) => a.startsWith("--confirm-host="))?.split("=")[1];

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/:\d+$/, "");
  } catch {
    return "<unparseable>";
  }
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from information_schema.tables where table_schema='public' and table_name=$1`,
    name
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from information_schema.columns
     where table_schema='public' and table_name=$1 and column_name=$2`,
    table,
    column
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function allColumnsPresent(): Promise<boolean> {
  for (const c of COLUMNS) if (!(await columnExists("users", c))) return false;
  return true;
}

async function isRecorded(name: string): Promise<boolean> {
  if (!(await tableExists("_prisma_migrations"))) return false;
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from "_prisma_migrations"
     where migration_name = $1 and finished_at is not null and rolled_back_at is null`,
    name
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

function runPrisma(prismaArgs: string[]) {
  execFileSync("npx", ["prisma", ...prismaArgs], { stdio: "inherit", env: process.env });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }
  const host = hostOf(dbUrl);

  console.log("─".repeat(72));
  console.log(`  TARGET DATABASE : ${host}`);
  console.log(`  MODE            : ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`  MIGRATION       : ${MIGRATION}`);
  console.log("─".repeat(72));

  if (APPLY) {
    if (!confirmHost) {
      console.error(`\n--apply requires --confirm-host=<host>. Pass --confirm-host=${host} if that is really the database you mean.`);
      process.exit(1);
    }
    if (confirmHost !== host) {
      console.error(`\nHost mismatch. DATABASE_URL points at "${host}" but you confirmed "${confirmHost}". Refusing to run.`);
      process.exit(1);
    }
  }

  if (!existsSync(join("prisma", "migrations", MIGRATION, "migration.sql"))) {
    console.error(`Migration folder missing: prisma/migrations/${MIGRATION} — wrong branch?`);
    process.exit(1);
  }

  for (const c of COLUMNS) {
    console.log(`  before: users.${c} ${(await columnExists("users", c)) ? "PRESENT" : "absent"}`);
  }

  const recorded = await isRecorded(MIGRATION);
  const present = await allColumnsPresent();
  const action = recorded ? "skip" : present ? "record-only" : "apply";
  console.log(`\nPLAN\n  [${action.toUpperCase().padEnd(11)}] ${MIGRATION}`);

  if (!APPLY) {
    console.log("\nDry run — nothing was changed. Re-run with:");
    console.log(`  npx tsx scripts/apply-tiktok-ttclid-migration.ts --apply --confirm-host=${host}`);
    await prisma.$disconnect();
    return;
  }

  if (action !== "skip") {
    if (action === "apply") {
      console.log(`\n▶ applying ${MIGRATION}`);
      runPrisma(["db", "execute", "--file", join("prisma", "migrations", MIGRATION, "migration.sql"), "--schema", join("prisma", "schema.prisma")]);
    } else {
      console.log(`\n▶ recording ${MIGRATION} (DDL already present)`);
    }
    runPrisma(["migrate", "resolve", "--applied", MIGRATION]);
  }

  let ok = true;
  console.log("\nVERIFY");
  for (const c of COLUMNS) {
    const has = await columnExists("users", c);
    ok &&= has;
    console.log(`  ${has ? "✓" : "✗"} users.${c}`);
  }
  await prisma.$disconnect();
  if (!ok) process.exit(1);
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

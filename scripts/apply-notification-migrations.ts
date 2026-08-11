/**
 * Applies the notification/messaging migrations to a target database.
 *
 * Why this exists instead of `prisma migrate deploy`: this project's prod
 * migration history has DIVERGED from the repo — there are migrations recorded
 * locally that prod never got, and vice versa. `migrate deploy` applies every
 * pending migration it finds, so running it against prod would drag unrelated
 * work along with it. This script applies an explicit ALLOWLIST, in order, and
 * refuses to touch anything else.
 *
 * Each migration is applied with `prisma db execute` (handles multi-statement
 * SQL correctly) and then recorded with `prisma migrate resolve --applied`, so
 * Prisma's _prisma_migrations table stays truthful and a later `migrate status`
 * doesn't report drift.
 *
 * Safe to re-run: every step is skipped if it has already been recorded, and
 * the object-level pre-flight catches the "SQL was run by hand in the Supabase
 * editor but never recorded" case (it records without re-running the DDL).
 *
 * Usage — dry run first, ALWAYS (prints the plan, touches nothing):
 *   npx tsx scripts/apply-notification-migrations.ts
 *
 * Then apply, naming the host you intend to hit so a stale .env can't send it
 * somewhere you didn't mean:
 *   npx tsx scripts/apply-notification-migrations.ts --apply --confirm-host=aws-1-us-east-1.pooler.supabase.com
 *
 * To include the PR #41 migrations (review notes + broadcast audience), which
 * are only needed once that PR merges, add --include-41.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Ordered allowlist. Nothing outside this list is ever applied. */
const MIGRATIONS_31 = [
  "20260726000000_add_notifications_and_messaging",
  "20260727000000_add_application_submitted_notification",
];

const MIGRATIONS_41 = [
  "20260810000000_add_moderation_review_notes",
  "20260810000001_add_broadcast_audience",
];

/**
 * Objects each migration creates, used for the pre-flight. If these already
 * exist but the migration isn't recorded, the DDL was run by hand — we record
 * it rather than re-running and erroring on "already exists".
 */
const CREATES: Record<string, { kind: "table" | "enumValue" | "column"; name: string; table?: string }[]> = {
  "20260726000000_add_notifications_and_messaging": [
    { kind: "table", name: "notifications" },
    { kind: "table", name: "broadcasts" },
    { kind: "table", name: "message_threads" },
    { kind: "table", name: "messages" },
  ],
  "20260727000000_add_application_submitted_notification": [
    { kind: "enumValue", name: "APPLICATION_SUBMITTED" },
  ],
  "20260810000000_add_moderation_review_notes": [
    { kind: "column", table: "samples", name: "review_note" },
    { kind: "column", table: "presets", name: "review_note" },
  ],
  "20260810000001_add_broadcast_audience": [
    { kind: "column", table: "broadcasts", name: "audience" },
  ],
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_41 = args.includes("--include-41");
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
    `select count(*)::bigint as n from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
    table,
    column
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function enumValueExists(value: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'NotificationType' and e.enumlabel = $1`,
    value
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Is this migration already recorded as applied in _prisma_migrations? */
async function isRecorded(name: string): Promise<boolean> {
  const hasTable = await tableExists("_prisma_migrations");
  if (!hasTable) return false;
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from "_prisma_migrations"
     where migration_name = $1 and finished_at is not null and rolled_back_at is null`,
    name
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Do all the objects this migration creates already exist? */
async function objectsPresent(name: string): Promise<boolean> {
  const specs = CREATES[name] ?? [];
  if (specs.length === 0) return false;
  for (const spec of specs) {
    const present =
      spec.kind === "table"
        ? await tableExists(spec.name)
        : spec.kind === "column"
          ? await columnExists(spec.table!, spec.name)
          : await enumValueExists(spec.name);
    if (!present) return false;
  }
  return true;
}

function runPrisma(prismaArgs: string[]) {
  execFileSync("npx", ["prisma", ...prismaArgs], {
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }

  const host = hostOf(dbUrl);
  const targets = INCLUDE_41 ? [...MIGRATIONS_31, ...MIGRATIONS_41] : MIGRATIONS_31;

  console.log("─".repeat(72));
  console.log(`  TARGET DATABASE : ${host}`);
  console.log(`  MODE            : ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`  MIGRATIONS      : ${targets.length} allowlisted${INCLUDE_41 ? " (incl. PR #41)" : ""}`);
  console.log("─".repeat(72));

  if (APPLY) {
    if (!confirmHost) {
      console.error(
        `\n--apply requires --confirm-host=<host>. Pass --confirm-host=${host} if that is really the database you mean.`
      );
      process.exit(1);
    }
    if (confirmHost !== host) {
      console.error(
        `\nHost mismatch. DATABASE_URL points at "${host}" but you confirmed "${confirmHost}". Refusing to run.`
      );
      process.exit(1);
    }
  }

  // Pre-flight: classify every migration before touching anything.
  const plan: { name: string; action: "apply" | "record-only" | "skip"; why: string }[] = [];
  for (const name of targets) {
    if (!existsSync(join("prisma", "migrations", name, "migration.sql"))) {
      console.error(`Migration folder missing: prisma/migrations/${name} — wrong branch?`);
      process.exit(1);
    }
    if (await isRecorded(name)) {
      plan.push({ name, action: "skip", why: "already recorded in _prisma_migrations" });
    } else if (await objectsPresent(name)) {
      plan.push({ name, action: "record-only", why: "objects already exist (ran by hand); recording only" });
    } else {
      plan.push({ name, action: "apply", why: "not applied" });
    }
  }

  console.log("\nPLAN");
  for (const step of plan) {
    const tag = step.action === "apply" ? "APPLY      " : step.action === "record-only" ? "RECORD-ONLY" : "SKIP       ";
    console.log(`  [${tag}] ${step.name}\n               ${step.why}`);
  }

  if (!APPLY) {
    console.log("\nDry run — nothing was changed. Re-run with:");
    console.log(`  npx tsx scripts/apply-notification-migrations.ts --apply --confirm-host=${host}${INCLUDE_41 ? " --include-41" : ""}`);
    await prisma.$disconnect();
    return;
  }

  for (const step of plan) {
    if (step.action === "skip") continue;

    if (step.action === "apply") {
      console.log(`\n▶ applying ${step.name}`);
      runPrisma([
        "db",
        "execute",
        "--file",
        join("prisma", "migrations", step.name, "migration.sql"),
        "--schema",
        join("prisma", "schema.prisma"),
      ]);
    } else {
      console.log(`\n▶ recording ${step.name} (DDL already present)`);
    }

    runPrisma(["migrate", "resolve", "--applied", step.name]);
  }

  // Post-verify: assert every object the allowlist promised now exists.
  console.log("\nVERIFY");
  let ok = true;
  for (const name of targets) {
    const present = await objectsPresent(name);
    console.log(`  ${present ? "✓" : "✗"} ${name}`);
    if (!present) ok = false;
  }

  await prisma.$disconnect();
  if (!ok) {
    console.error("\nSome objects are still missing — inspect before deploying the app.");
    process.exit(1);
  }
  console.log("\nDone. Safe to merge and deploy.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

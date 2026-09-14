/**
 * For You conversion, read from the attribution tables. Read-only.
 *
 *   npx tsx scripts/for-you-conversion.ts            # last 14 days
 *   npx tsx scripts/for-you-conversion.ts --days=30
 *
 * "Shown" counts every sample position in every served list, so the same
 * sample on two page loads counts twice, the way two ad impressions would.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const days = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 14);

const per100 = (hits: number, shown: number) => (shown ? ((100 * hits) / shown).toFixed(2) : "–");
const n = (v: bigint | number | null) => Number(v ?? 0);

async function main() {
  const [tables] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('recommendation_impressions', 'recommendation_outcomes')`
  );
  if (n(tables.n) < 2) {
    console.log("The attribution tables don't exist yet. Run scripts/apply-recommendation-tracking-migration.ts first.");
    return;
  }

  const [t] = await prisma.$queryRawUnsafe<
    Array<{ lists: bigint; users: bigint; shown: bigint; bought: bigint; liked: bigint; all_bought: bigint }>
  >(
    `WITH imp AS (
       SELECT * FROM recommendation_impressions
        WHERE created_at >= now() - make_interval(days => $1::int)
     )
     SELECT (SELECT count(*) FROM imp)::bigint AS lists,
            (SELECT count(DISTINCT user_id) FROM imp)::bigint AS users,
            (SELECT coalesce(sum(cardinality(sample_ids)), 0) FROM imp)::bigint AS shown,
            (SELECT count(*) FROM recommendation_outcomes o JOIN imp ON imp.id = o.impression_id
              WHERE o.kind = 'PURCHASE' AND o.sample_id IS NOT NULL)::bigint AS bought,
            (SELECT count(*) FROM recommendation_outcomes o JOIN imp ON imp.id = o.impression_id
              WHERE o.kind = 'FAVORITE' AND o.sample_id IS NOT NULL)::bigint AS liked,
            (SELECT count(*) FROM purchases
              WHERE sample_id IS NOT NULL
                AND created_at >= now() - make_interval(days => $1::int))::bigint AS all_bought`,
    days
  );

  console.log(`For You, last ${days} days`);
  console.log(`  lists served          ${n(t.lists)}  (to ${n(t.users)} buyers)`);
  console.log(`  samples shown         ${n(t.shown)}`);
  console.log(`  bought from For You   ${n(t.bought)}  → ${per100(n(t.bought), n(t.shown))} per 100 shown, ` +
    `${n(t.all_bought) ? ((100 * n(t.bought)) / n(t.all_bought)).toFixed(1) : "–"}% of all sample purchases`);
  console.log(`  liked from For You    ${n(t.liked)}  → ${per100(n(t.liked), n(t.shown))} per 100 shown`);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ grp: string; label: string; shown: bigint; bought: bigint; liked: bigint }>
  >(
    `WITH imp AS (
       SELECT * FROM recommendation_impressions
        WHERE created_at >= now() - make_interval(days => $1::int)
     ),
     shown AS (
       SELECT imp.id AS impression_id, u.sample_id, u.pos,
              CASE WHEN imp.cold THEN 'popular picks (new users)'
                   WHEN u.similar > 0 THEN 'bought by similar buyers'
                   ELSE 'matches their taste' END AS signal
         FROM imp,
              unnest(imp.sample_ids, imp.sample_similar_buyers) WITH ORDINALITY AS u(sample_id, similar, pos)
     ),
     scored AS (
       SELECT s.*,
              EXISTS (SELECT 1 FROM recommendation_outcomes o WHERE o.impression_id = s.impression_id
                         AND o.sample_id = s.sample_id AND o.kind = 'PURCHASE') AS bought,
              EXISTS (SELECT 1 FROM recommendation_outcomes o WHERE o.impression_id = s.impression_id
                         AND o.sample_id = s.sample_id AND o.kind = 'FAVORITE') AS liked
         FROM shown s
     )
     SELECT 'rank' AS grp,
            CASE WHEN pos <= 10 THEN '1–10' WHEN pos <= 25 THEN '11–25' ELSE '26–50' END AS label,
            count(*)::bigint AS shown, count(*) FILTER (WHERE bought)::bigint AS bought,
            count(*) FILTER (WHERE liked)::bigint AS liked
       FROM scored GROUP BY 2
     UNION ALL
     SELECT 'signal', signal, count(*)::bigint, count(*) FILTER (WHERE bought)::bigint,
            count(*) FILTER (WHERE liked)::bigint
       FROM scored GROUP BY 2
     ORDER BY 1, 2`,
    days
  );

  for (const grp of ["rank", "signal"]) {
    console.log(`\n  by ${grp === "rank" ? "position" : "why it was picked"}`);
    for (const r of rows.filter((x) => x.grp === grp)) {
      console.log(`    ${r.label.padEnd(28)} shown ${String(n(r.shown)).padStart(7)}   ` +
        `bought ${String(n(r.bought)).padStart(5)} (${per100(n(r.bought), n(r.shown))}/100)   ` +
        `liked ${String(n(r.liked)).padStart(5)} (${per100(n(r.liked), n(r.shown))}/100)`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

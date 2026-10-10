// pnpm seed：把 data/seed/places.json 匯入資料庫（流程見 scripts/seed/run.ts）
// 預設連本機 Supabase；要連其他資料庫請設 DATABASE_URL，並加上 --allow-remote。
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { loadOsmBounds } from './seed/osm-bounds';
import { runSeed } from './seed/run';
import { assertValidSeed } from './seed/validate';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

async function main() {
  const url = process.env.DATABASE_URL ?? LOCAL_DB;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.argv.includes('--allow-remote')) {
    throw new Error(`DATABASE_URL 指向 ${host}，不是本機；確定要匯入的話加上 --allow-remote`);
  }

  const seed: unknown = JSON.parse(readFileSync('data/seed/places.json', 'utf8'));
  assertValidSeed(seed);

  const db = postgres(url, { onnotice: () => {} });
  try {
    const s = await runSeed(db, seed, loadOsmBounds());
    console.log('各表筆數');
    for (const [table, n] of Object.entries(s.counts)) console.log(`  ${table.padEnd(18)} ${n}`);
    console.log('縣市範圍 [西, 南, 東, 北]');
    for (const c of s.bboxes) {
      const how = c.source === 'places' ? '場地座標外擴 1 公里' : 'OSM 行政界';
      console.log(`  ${c.code} ${JSON.stringify(c.bbox)}（${how}）`);
    }
    console.log('每個場地已知屬性數（y 有／n 無；其餘為未知）');
    for (const p of s.knownAttrs)
      console.log(`  ${p.id.padEnd(28)} y ${String(p.y).padStart(2)}  n ${p.n}  ${p.name}`);
    if (s.orphanPlaces.length > 0) {
      console.warn(
        `注意：資料庫有 ${s.orphanPlaces.length} 處場地不在 places.json，未自動刪除：${s.orphanPlaces.join(', ')}`,
      );
    }
  } finally {
    await db.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

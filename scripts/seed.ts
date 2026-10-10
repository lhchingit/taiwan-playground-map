// pnpm seed：把 data/seed/<縣市>/places.json 匯入資料庫（流程見 scripts/seed/run.ts）
//   pnpm seed                       全部縣市
//   pnpm seed --city hsq            只匯入新竹縣
//   pnpm seed --dry-run             試跑：做完全部步驟後回滾，只印出會改變什麼
//   pnpm seed --prune               也刪除資料庫有、places.json 沒有的場地（有使用者回報資料的拒絕刪除）
// 預設只連本機 Supabase；連其他資料庫要設 DATABASE_URL 並加上 --allow-remote。
// 匯入不會改上線狀態，上線／下線用 pnpm city。
import { connect, isLocalDatabase, parseSeedArgs, resolveDatabaseUrl } from './seed/cli';
import { loadAllSeeds } from './seed/files';
import { boundsWithoutSeeds, loadOsmBounds } from './seed/osm-bounds';
import { revalidateSite } from './seed/revalidate-site';
import { runSeed, type SeedSummary } from './seed/run';

function print(code: string, s: SeedSummary) {
  console.log(`\n== ${code}${s.dryRun ? '（試跑，已回滾，沒有寫入）' : ''}`);
  console.log('各表筆數（匯入前 → 匯入後）');
  for (const [table, n] of Object.entries(s.counts)) {
    console.log(`  ${table.padEnd(18)} ${String(s.before[table] ?? 0).padStart(5)} → ${n}`);
  }
  const changed = Object.entries(s.changes).filter(([, n]) => n > 0);
  console.log(
    changed.length > 0
      ? `變動：${changed.map(([k, n]) => `${k} ${n}`).join('、')}`
      : '變動：沒有（資料庫已經是最新）',
  );
  console.log('縣市範圍 [西, 南, 東, 北]');
  for (const c of s.bboxes) {
    const how = c.source === 'places' ? '場地座標外擴 1 公里' : 'OSM 行政界';
    console.log(`  ${c.code} ${JSON.stringify(c.bbox)}（${how}）`);
  }
  console.log('每個場地已知屬性數（y 有／n 無；其餘為未知）');
  for (const p of s.knownAttrs) {
    console.log(`  ${p.id.padEnd(28)} y ${String(p.y).padStart(2)}  n ${p.n}  ${p.name}`);
  }
  for (const l of s.launched) {
    console.log(
      l.launchedAt
        ? `上線狀態：${l.code} 已上線（${l.launchedAt}）`
        : `上線狀態：${l.code} 尚未上線（確認資料後執行 pnpm city launch ${l.code}）`,
    );
  }
  if (s.pruned.length > 0) {
    console.log(
      `${s.dryRun ? '會刪除' : '已刪除'} ${s.pruned.length} 處不在 places.json 的場地：${s.pruned.join(', ')}`,
    );
  }
  if (s.pruneBlocked.length > 0) {
    console.warn(
      `注意：${s.pruneBlocked.join(', ')} 不在 places.json，但有使用者回報資料，沒有刪除；請人工處理。`,
    );
  }
  if (s.orphanPlaces.length > s.pruneBlocked.length) {
    const left = s.orphanPlaces.filter((id) => !s.pruneBlocked.includes(id));
    console.warn(
      `注意：資料庫有 ${left.length} 處場地不在 places.json，未刪除：${left.join(', ')}（加上 --prune 才會刪除）`,
    );
  }
}

async function main() {
  const args = parseSeedArgs(process.argv.slice(2));
  const url = resolveDatabaseUrl(process.env.DATABASE_URL, args.allowRemote);

  // 一律讀取並檢查「全部」縣市的檔案（跨檔一致性），再只匯入指定的縣市
  const all = loadAllSeeds();
  const targets = args.city ? all.filter(([code]) => code === args.city) : all;
  if (targets.length === 0) {
    throw new Error(
      args.city ? `找不到 data/seed/${args.city}/places.json` : 'data/seed/ 底下沒有任何縣市',
    );
  }
  const osm = boundsWithoutSeeds(
    loadOsmBounds(),
    all.map(([code]) => code),
  );

  const db = connect(url);
  try {
    for (const [code, seed] of targets) {
      const summary = await runSeed(db, seed, osm, { dryRun: args.dryRun, prune: args.prune });
      print(code, summary);
      // 真的寫入、而且有變動時，通知網站清快取
      if (!summary.dryRun && Object.values(summary.changes).some((n) => n > 0)) {
        await revalidateSite(code, isLocalDatabase(url));
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

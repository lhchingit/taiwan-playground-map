// pnpm naming:export：把會員命名（decisions D23）已經決定的結果寫回 data/raw/<縣市>/manual-names.tsv。
//   pnpm naming:export               全部縣市
//   pnpm naming:export --city nwt    只匯出新北市
// 預設只連本機 Supabase；連其他資料庫要設 DATABASE_URL 並加上 --allow-remote。
// 之後照原本的流程重新匯入（例如 python scripts/import_osm_city.py nwt）、提交、開 PR。
// 場地 id、名稱都跟資料庫一致，重新匯入後地圖不會變。
import { existsSync, writeFileSync } from 'node:fs';
import { connect, parseSeedArgs, resolveDatabaseUrl } from './seed/cli';
import { mergeNamingResults, type NamingResult } from './seed/naming';
import { CITIES, namesPath, readNames } from './tools/name/items';
import { serializeNamesFile } from './tools/name/names-file';

async function main() {
  const args = parseSeedArgs(process.argv.slice(2));
  if (args.dryRun || args.prune) throw new Error('naming:export 只接受 --city 與 --allow-remote');
  const db = connect(resolveDatabaseUrl(process.env.DATABASE_URL, args.allowRemote));
  try {
    const cities = CITIES.filter((c) => c.key === 'OSM' && (!args.city || c.code === args.city));
    if (cities.length === 0) throw new Error(`沒有這個縣市，或它不是用 OSM 編號命名：${args.city}`);
    for (const city of cities) {
      const results = await db<NamingResult[]>`
        SELECT osm_ref, status, resolved_name, resolved_basis, resolved_by, resolved_votes,
               to_char(resolved_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD') AS resolved_on
        FROM naming_candidates
        WHERE city = ${city.code} AND status IN ('named', 'excluded') AND resolved_by IN ('votes', 'moderator')
        ORDER BY resolved_at, id`;
      const { entries, added } = mergeNamingResults(readNames('.', city.code), results);
      if (added.length === 0) {
        console.log(`${city.name}：沒有新的結果`);
        continue;
      }
      if (!existsSync(`data/raw/${city.code}`)) throw new Error(`找不到 data/raw/${city.code}`);
      writeFileSync(namesPath(city.code), serializeNamesFile(entries, city.key));
      const named = added.filter((a) => a.name !== '（排除）').length;
      console.log(
        `${city.name}：寫入 ${added.length} 筆（命名 ${named}、排除 ${added.length - named}）→ ${namesPath(city.code)}`,
      );
      console.log(`  接著執行：${city.importCmd}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

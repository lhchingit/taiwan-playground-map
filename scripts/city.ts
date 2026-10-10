// pnpm city status|launch|unlaunch <縣市代碼> [--allow-remote]
// 上線／下線後，有設定 SITE_URL 與 REVALIDATE_SECRET 時會呼叫網站的清快取 API，讓變更立刻生效；
// 沒設定時網站最多 1 小時後才會更新。
import { connect, parseCityArgs, resolveDatabaseUrl } from './seed/cli';
import { cityStatus, launchCity, unlaunchCity } from './seed/city';
import { revalidateSite } from './seed/revalidate-site';

async function main() {
  const args = parseCityArgs(process.argv.slice(2));
  const db = connect(resolveDatabaseUrl(process.env.DATABASE_URL, args.allowRemote));
  try {
    if (args.action === 'launch' && args.code) {
      console.log(`${args.code} 已上線（${await launchCity(db, args.code)}）`);
      await revalidateSite(args.code);
    } else if (args.action === 'unlaunch' && args.code) {
      await unlaunchCity(db, args.code);
      console.log(`${args.code} 已下線，匿名使用者看不到這個縣市的資料。`);
      await revalidateSite(args.code);
    }
    console.log('\n縣市      場地數  上線時間');
    for (const c of await cityStatus(db)) {
      if (args.code && c.code !== args.code && args.action === 'status') continue;
      console.log(
        `  ${c.code} ${c.name.padEnd(4, '　')} ${String(c.places).padStart(5)}  ${c.launchedAt ?? '未上線'}`,
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

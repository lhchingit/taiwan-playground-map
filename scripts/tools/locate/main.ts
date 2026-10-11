// pnpm tool:locate：啟動人工定位工具（server.ts）
import { resolve } from 'node:path';
import { createLocateServer } from './server';

const port = Number(process.env.PORT ?? 4100);
const root = resolve(process.env.LOCATE_DATA_ROOT ?? '.');
// pnpm tool:locate -- --city tyc；預設新竹市
const i = process.argv.indexOf('--city');
const city = i >= 0 ? (process.argv[i + 1] ?? '') : 'hsc';
if (!/^[a-z]{3}$/.test(city)) throw new Error('--city 要是三碼縣市代碼，例如 tyc');
const IMPORT: Record<string, string> = {
  hsc: 'python scripts/build_seed.py && python scripts/import_hccg.py',
  tyc: 'python scripts/import_tycg.py',
};
createLocateServer(root, city).listen(port, '127.0.0.1', () => {
  console.log(`人工定位工具（${city}）：http://localhost:${port}（資料：${root}）`);
  console.log(
    '定位依據只能是實地確認、OSM 地圖上可見的公園範圍、政府公告的地址；不可以用 Google 地圖。',
  );
  console.log(`完成後執行 ${IMPORT[city] ?? '該縣市的匯入腳本'} 套用結果。`);
});

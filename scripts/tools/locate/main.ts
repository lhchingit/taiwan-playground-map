// pnpm tool:locate：啟動人工定位工具（server.ts）
import { resolve } from 'node:path';
import { createLocateServer } from './server';

const port = Number(process.env.PORT ?? 4100);
const root = resolve(process.env.LOCATE_DATA_ROOT ?? '.');
createLocateServer(root).listen(port, '127.0.0.1', () => {
  console.log(`人工定位工具：http://localhost:${port}（資料：${root}）`);
  console.log(
    '定位依據只能是實地確認、OSM 地圖上可見的公園範圍、政府公告的地址；不可以用 Google 地圖。',
  );
  console.log(
    '完成後執行 python scripts/build_seed.py && python scripts/import_hccg.py 套用結果。',
  );
});

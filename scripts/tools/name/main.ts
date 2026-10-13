// pnpm tool:name：啟動人工命名工具（server.ts）
import { resolve } from 'node:path';
import { createNameServer } from './server';

const port = Number(process.env.PORT ?? 4101);
const root = resolve(process.env.NAME_DATA_ROOT ?? '.');
createNameServer(root).listen(port, '127.0.0.1', () => {
  console.log(`人工命名工具：http://localhost:${port}（資料：${root}）`);
  console.log(
    '命名依據只能是 OSM 地圖上可見的名稱、實地確認、政府公告；不可以用 Google 地圖查名稱。',
  );
  console.log('完成後執行各縣市的匯入腳本套用結果（頁面上有指令）。');
});

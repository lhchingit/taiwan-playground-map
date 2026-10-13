// 人工命名工具（scripts/tools/name）：在暫存資料夾的假資料上啟動，不會改到 repo 的 manual-names.tsv。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createNameServer } from '../../scripts/tools/name/server';

test.skip(({ isMobile }) => isMobile, '本機工具只在桌機使用');
test.describe.configure({ mode: 'serial' });

let root = '';
let server: Server;
let url = '';

function write(rel: string, text: string) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), text);
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'name-'));
  // 苗栗縣：兩處沒有名稱的 OSM 遊戲場（假資料）
  write(
    'data/review/mlc/unnamed.csv',
    '\uFEFFOSM,行政區,緯度,經度,OSM 連結,處理方式\n' +
      'n1,竹南鎮,24.69,120.88,https://www.openstreetmap.org/node/1,x\n' +
      'n2,頭份市,24.68,120.91,https://www.openstreetmap.org/node/2,x\n',
  );
  write(
    'data/raw/mlc/osm-nearby.json',
    JSON.stringify({
      nearby: { n1: [{ name: '測試公園', kind: '公園', osm: 'w9', distance_m: 20 }], n2: [] },
    }),
  );
  // 臺北市：用地編號名稱（鍵是編號，不能排除）
  write(
    'data/review/tpe/odd-names.csv',
    '\uFEFF編號,名稱,行政區,緯度,經度,處理方式\n110,園(信義)16,信義區,25.049,121.57,x\n',
  );
  server = createNameServer(root);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
});

const names = (city: string) =>
  readFileSync(join(root, `data/raw/${city}/manual-names.tsv`), 'utf8')
    .trimEnd()
    .split('\n');

test('點附近的名稱 → Enter 儲存並跳到下一筆，寫進 manual-names.tsv', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByText('不可以用 Google 地圖查名稱')).toBeVisible();
  await expect(page.locator('#progress')).toHaveText('已處理 0／3');
  await page.getByLabel('確認者').fill('測試者');

  // 沒選依據就存：伺服器擋下
  await page.getByLabel('名稱', { exact: true }).fill('隨便寫的名稱');
  await page.keyboard.press('Enter');
  await expect(page.locator('#errors')).toContainText('命名依據要是');

  await page.getByRole('button', { name: /測試公園/ }).click();
  await expect(page.getByLabel('名稱', { exact: true })).toHaveValue('測試公園');
  await expect(page.locator('#basis')).toHaveValue('OSM 地圖上可見的名稱');
  await page.keyboard.press('Enter');
  await expect(page.locator('#title')).toHaveText('n2');
  await expect.poll(() => names('mlc').length).toBe(2);
  expect(names('mlc')).toEqual([
    'OSM\t名稱\t依據\t確認者\t日期',
    expect.stringMatching(/^n1\t測試公園\tOSM 地圖上可見的名稱\t測試者\t\d{4}-\d{2}-\d{2}$/),
  ]);
  await expect(page.locator('#progress')).toHaveText('已處理 1／3');
});

test('排除一筆；刪除結果', async ({ page }) => {
  await page.goto(url);
  await page.locator('#list li', { hasText: 'n2' }).click();
  await page.getByLabel('確認者').fill('測試者');
  await page.getByLabel('排除的理由').selectOption('私人社區');
  await page.getByRole('button', { name: '排除（E）' }).click();
  await expect(page.locator('#list li', { hasText: 'n2' })).toContainText('✓ （排除）');
  expect(names('mlc')[2]).toMatch(/^n2\t（排除）\t私人社區\t測試者\t/);

  await page.locator('#list li', { hasText: 'n2' }).click();
  await page.getByRole('button', { name: '刪除這筆結果' }).click();
  await expect(page.locator('#list li', { hasText: 'n2' })).toContainText('沒有名稱');
  await expect.poll(() => names('mlc').length).toBe(2);
});

test('臺北市的用地編號：沒有排除，只能命名；鍵是編號', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: /臺北市/ }).click();
  await expect(page.locator('#context')).toContainText('園(信義)16');
  await expect(page.getByRole('button', { name: '排除（E）' })).toBeHidden();
  await page.getByLabel('確認者').fill('測試者');
  await page.getByLabel('名稱', { exact: true }).fill('信義區某公園');
  await page.locator('#basis').selectOption('實地確認');
  await page.getByRole('button', { name: /儲存並下一筆/ }).click();
  await expect(page.locator('#list li').first()).toContainText('✓ 信義區某公園');
  expect(names('tpe')[0]).toBe('編號\t名稱\t依據\t確認者\t日期');
  expect(names('tpe')[1]).toMatch(/^110\t信義區某公園\t實地確認\t測試者\t/);
});

test('API 直接送：不在清單的鍵、臺北市排除、Google 依據都被擋下', async ({ request }) => {
  const post = (data: object) => request.post(`${url}/api/name`, { data });
  const base = { city: 'mlc', by: '測試者', action: 'name', name: '某公園' };
  expect((await post({ ...base, key: 'n999', basis: '實地確認' })).status()).toBe(400);
  expect((await post({ ...base, key: 'n1', basis: 'Google 地圖' })).status()).toBe(400);
  const tpe = await post({
    city: 'tpe',
    key: '110',
    by: '測試者',
    action: 'exclude',
    basis: '私人社區',
  });
  expect(tpe.status()).toBe(400);
  expect((await tpe.json()).errors.join()).toContain('不能排除');
});

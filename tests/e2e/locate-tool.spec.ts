// 人工定位工具（scripts/tools/locate）：在暫存資料夾的資料副本上啟動，不會改到 repo 的 manual-review.tsv。
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createLocateServer } from '../../scripts/tools/locate/server';

test.skip(({ isMobile }) => isMobile, '本機工具只在桌機使用');

let root = '';
let server: Server;
let url = '';

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'locate-'));
  for (const dir of ['data/raw/hsc', 'data/seed/hsc'])
    cpSync(dir, join(root, dir), { recursive: true });
  rmSync(join(root, 'data/raw/hsc/manual-review.tsv'), { force: true });
  server = createLocateServer(root);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

const reviewFile = () => join(root, 'data/raw/hsc/manual-review.tsv');

test('選一筆 → 點地圖 → 選定位依據 → 儲存，寫進 manual-review.tsv', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByText('不可以用 Google 地圖查座標')).toBeVisible();
  await expect(page.locator('#progress')).toHaveText('已處理 0／32');

  await page.getByRole('button', { name: /#9 南勢重劃公園/ }).click();
  await expect(page.getByRole('heading', { name: '#9 南勢重劃公園' })).toBeVisible();

  // 沒點地圖就存：伺服器拒絕
  await page.getByLabel('定位依據').selectOption('OSM 地圖上可見的公園範圍');
  await page.getByLabel('定位者').fill('測試者');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('#msg')).toContainText('沒有座標');
  expect(existsSync(reviewFile())).toBe(false);

  await page.locator('#map').click({ position: { x: 400, y: 300 } });
  await expect(page.locator('#coords')).toHaveText(/^24\.\d+, 120\.\d+$/);
  await page.getByLabel('說明').fill('公園範圍在南勢街旁');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('#msg')).toHaveText(/已儲存/);

  const [, line] = readFileSync(reviewFile(), 'utf8').trimEnd().split('\n');
  expect(line).toMatch(
    /^9\tlocated\t24\.\d+\t120\.\d+\tOSM 地圖上可見的公園範圍\t\t公園範圍在南勢街旁\t測試者\t\d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.locator('#progress')).toHaveText('已處理 1／32');
});

test('標註重複：吉羊公園 #32 同 #15；清除結果', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: /#32 吉羊公園/ }).click();
  await expect(page.locator('#detail')).toContainText('地點：吉羊路、東大路');
  await page.getByLabel('處理結果').selectOption('duplicate');
  await page.getByLabel('對應的清冊編號').fill('15');
  await page.getByLabel('定位者').fill('測試者');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('#msg')).toHaveText(/已儲存/);
  expect(readFileSync(reviewFile(), 'utf8')).toMatch(/\n32\tduplicate\t\t\t\t15\t\t測試者\t/);

  await page.getByRole('button', { name: '已處理' }).click();
  await expect(page.locator('#list')).toContainText('#32 吉羊公園');

  await page.getByRole('button', { name: /#32 吉羊公園/ }).click();
  await page.getByRole('button', { name: '清除結果' }).click();
  await expect(page.locator('#detail')).not.toContainText('目前結果');
  expect(readFileSync(reviewFile(), 'utf8')).not.toContain('\n32\t');
});

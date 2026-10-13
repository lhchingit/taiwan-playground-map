// 多縣市：測試縣（tst，只存在於測試，tests/db/test-city.ts）暫時上線（用 tests/fixtures/seed-test.json 的測試場地）→ / 變成縣市選單；
// 下線並清快取後恢復。會暫時改動共用的資料庫狀態，所以在 playwright.config.ts 的 multi-city 專案、
// 其他 e2e 跑完之後才執行。
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { TOTAL } from './expected';
import type { SeedFile } from '@/types/place';
import { adminSql } from '../db/helpers';
import { dropTestCity, ensureTestCity } from '../db/test-city';
import { toSeedRows } from '../../scripts/seed/transform';
import { E2E_REVALIDATE_SECRET } from './constants';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）不知道清快取的密鑰');
test.describe.configure({ mode: 'serial' });

const sql = adminSql();
// Playwright 以 ES module 執行，直接讀檔比 import JSON 單純
const fixture = JSON.parse(readFileSync('tests/fixtures/seed-test.json', 'utf8')) as SeedFile;
const rows = toSeedRows(fixture);
const ids = rows.places.map((p) => p.id);

const revalidate = (request: APIRequestContext, city: unknown, secret = E2E_REVALIDATE_SECRET) =>
  request.post('/api/revalidate', {
    headers: { Authorization: `Bearer ${secret}` },
    data: { city },
  });

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test.beforeAll(() => ensureTestCity(sql));

test.afterAll(async ({ request }) => {
  await sql`DELETE FROM places WHERE id = ANY(${ids})`;
  await dropTestCity(sql);
  await revalidate(request, 'tst');
  await sql.end();
});

test('清快取 API：密鑰錯誤 401、縣市代碼不對 400、正確 200', async ({ request }) => {
  expect((await revalidate(request, 'tst', 'wrong-secret')).status()).toBe(401);
  expect((await revalidate(request, '../etc')).status()).toBe(400);
  const ok = await revalidate(request, 'hsc');
  expect(ok.status()).toBe(200);
  expect((await ok.json()).revalidated).toContain('city:hsc');
});

test('只有新竹市上線時，/ 直接導向新竹市，也沒有「切換縣市」', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/hsinchu-city$/);
  await expect(page.getByText(/資料 \d+ 處/)).toBeVisible();
  await expect(page.getByRole('link', { name: '切換縣市' })).toHaveCount(0);
});

test('測試縣上線並清快取後：/ 是縣市選單，測試縣的頁面可以瀏覽', async ({ page, request }) => {
  for (const p of rows.places) {
    await sql`INSERT INTO places (id, name, city, geom)
              VALUES (${p.id}, ${p.name}, ${p.city}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))`;
  }
  await sql`UPDATE cities SET launched_at = now() WHERE code = 'tst'`;
  expect((await revalidate(request, 'tst')).ok()).toBe(true);

  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('全台放電地圖');
  const list = page.locator('.city-list');
  await expect(list.getByRole('link')).toHaveText(['新竹市', '測試縣']);
  await expect(list.locator('li', { hasText: '新竹市' })).toContainText(`${TOTAL} 處`);
  await expect(list.locator('li', { hasText: '測試縣' })).toContainText('2 處');

  await list.getByRole('link', { name: '測試縣' }).click();
  await expect(page).toHaveURL(/\/test-city$/);
  await expect(page.locator('a.card[data-id="test-tst-known"]')).toBeVisible();

  // 兩個縣市上線：縣市首頁有「切換縣市」，回到縣市選單
  await page.getByRole('link', { name: '切換縣市' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.city-list')).toBeVisible();

  const res = await page.goto('/test-city/places/test-tst-known');
  expect(res?.status()).toBe(200);
});

test('測試縣下線並清快取後：場地頁 404、/ 恢復導向新竹市', async ({ page, request }) => {
  await sql`UPDATE cities SET launched_at = NULL WHERE code = 'tst'`;
  expect((await revalidate(request, 'tst')).ok()).toBe(true);

  expect((await page.goto('/test-city/places/test-tst-known'))?.status()).toBe(404);
  await page.goto('/');
  await expect(page).toHaveURL(/\/hsinchu-city$/);
});

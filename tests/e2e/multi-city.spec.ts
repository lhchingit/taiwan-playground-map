// 多縣市：測試縣（tst，只存在於測試，tests/db/test-city.ts）暫時上線（用 tests/fixtures/seed-test.json 的測試場地）→ / 變成縣市選單；
// 下線並清快取後恢復。會暫時改動共用的資料庫狀態，所以在 playwright.config.ts 的 multi-city 專案、
// 其他 e2e 跑完之後才執行。
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { TOTAL } from './expected';
import type { SeedFile } from '@/types/place';
import { adminSql } from '../db/helpers';
import { dropTestCity, ensureTestCity } from '../db/test-city';
import { toSeedRows } from '../../scripts/seed/transform';
import { E2E_REVALIDATE_SECRET } from './constants';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）不知道清快取的密鑰');
test.describe.configure({ mode: 'serial' });

const sql = adminSql();
// Playwright 以 ES module 執行，直接讀檔比 import JSON 單純
const fixture = JSON.parse(readFileSync('tests/fixtures/seed-test.json', 'utf8')) as SeedFile;
const rows = toSeedRows(fixture);
const ids = rows.places.map((p) => p.id);
const email = `test-e2e-home-${randomUUID()}@example.test`;

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
  await sql`DELETE FROM auth.users WHERE email = ${email}`;
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
  await expect(page.getByRole('combobox', { name: '切換縣市' })).toHaveCount(0);
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
  // 首頁也有登入按鈕（登入後回到首頁）
  await expect(
    page.getByRole('navigation', { name: '帳號' }).getByRole('link', { name: '登入', exact: true }),
  ).toHaveAttribute('href', '/login?next=%2F');
  const list = page.locator('.city-list');
  await expect(list.getByRole('link')).toHaveText(['新竹市', '測試縣']);
  await expect(list.locator('li', { hasText: '新竹市' })).toContainText(`${TOTAL} 處`);
  await expect(list.locator('li', { hasText: '測試縣' })).toContainText('2 處');

  // 台灣地圖：已上線的新竹市可以點，未上線的臺北市不是連結；測試縣不在地圖上，只在清單裡
  const map = page.getByRole('group', { name: '台灣縣市地圖' });
  await expect(map.getByRole('link', { name: `新竹市，${TOTAL} 處` })).toBeVisible();
  await expect(map.getByRole('link', { name: /臺北市/ })).toHaveCount(0);
  await expect(
    map.locator('path.tw-off', { has: page.locator('title', { hasText: '臺北市（尚未上線）' }) }),
  ).toHaveCount(1);
  await map.getByRole('link', { name: `新竹市，${TOTAL} 處` }).click();
  await expect(page).toHaveURL(/\/hsinchu-city$/);
  await page.goto('/');

  await list.getByRole('link', { name: '測試縣' }).click();
  await expect(page).toHaveURL(/\/test-city$/);
  await expect(page.locator('a.card[data-id="test-tst-known"]')).toBeVisible();

  // 兩個縣市上線：縣市名稱是「切換縣市」選單，手指好點；切換時帶著篩選條件
  await page.goto('/hsinchu-city?play=sandpit');
  const menu = page.getByRole('combobox', { name: '切換縣市' });
  await expect(menu).toHaveValue('hsinchu-city');
  expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // 第一項是全部縣市，接著是各縣市與場地數
  await expect(menu.locator('option')).toHaveText([
    '全部縣市（台灣地圖）',
    `新竹市（${TOTAL} 處）`,
    '測試縣（2 處）',
  ]);
  await menu.selectOption('test-city');
  await expect(page).toHaveURL(/\/test-city\?play=sandpit$/);
  await expect(page.getByRole('combobox', { name: '切換縣市' })).toHaveValue('test-city');
  // 第一項回到縣市選單
  await page
    .getByRole('combobox', { name: '切換縣市' })
    .selectOption({ label: '全部縣市（台灣地圖）' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.city-list')).toBeVisible();

  const res = await page.goto('/test-city/places/test-tst-known');
  expect(res?.status()).toBe(200);

  // sitemap 也跟著更新（請求時產生，不用重新部署）
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('/test-city</loc>');
  expect(xml).toContain('/test-city/places/test-tst-known</loc>');
});

test('從首頁登入，回到首頁顯示暱稱與選單（我的貢獻、登出）', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '帳號' });
  await nav.getByRole('link', { name: '登入', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await loginWithEmail(page, email);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.city-list')).toBeVisible();
  const me = nav.getByText(/^家長 \d{4}$/);
  await me.click();
  await expect(nav.getByRole('link', { name: '我的貢獻' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '審核後台' })).toHaveCount(0); // 一般會員沒有
  await nav.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole('link', { name: '登入', exact: true })).toBeVisible();
});

test('測試縣下線並清快取後：場地頁 404、/ 恢復導向新竹市', async ({ page, request }) => {
  await sql`UPDATE cities SET launched_at = NULL WHERE code = 'tst'`;
  expect((await revalidate(request, 'tst')).ok()).toBe(true);

  expect((await page.goto('/test-city/places/test-tst-known'))?.status()).toBe(404);
  await page.goto('/');
  await expect(page).toHaveURL(/\/hsinchu-city$/);
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/test-city');
});

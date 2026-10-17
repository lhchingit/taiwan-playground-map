// 幫忙命名（decisions D23）：會員選一處 → 點附近的 OSM 名稱 → 送出 → 達到門檻時立刻上地圖。
// 門檻預設 10 人（管理員設定）；這裡暫時設成 3 人，跑完恢復。
// 會在新竹市建立場地，所以跟審核一樣在 moderation 專案、其他 e2e 跑完之後才執行；跑完刪除測試資料並清快取。
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { actors } from '../db/auth-helpers';
import { adminSql } from '../db/helpers';
import { E2E_REVALIDATE_SECRET } from './constants';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）不知道清快取的密鑰');
test.describe.configure({ mode: 'serial' });

const sql = adminSql();
const people = actors(sql);
const ID = `test-naming-e2e-${process.pid}`;
const ID2 = `${ID}-b`;
const NAME = 'test-測試小公園';
const created: string[] = [];
let originalThreshold = 10;

// 不帶縣市：連門檻（naming-settings）一起清
const revalidate = async (request: import('@playwright/test').APIRequestContext) => {
  for (const data of [{ city: 'hsc' }, {}]) {
    await request.post('/api/revalidate', {
      headers: { Authorization: `Bearer ${E2E_REVALIDATE_SECRET}` },
      data,
    });
  }
};

test.beforeAll(async ({ request }) => {
  originalThreshold = (await sql`SELECT naming_threshold FROM site_settings`)[0]!
    .naming_threshold as number;
  await sql`UPDATE site_settings SET naming_threshold = 3`;
  await sql`
    INSERT INTO naming_candidates (id, city, osm_ref, district, geom, nearby) VALUES
      (${ID}, 'hsc', 'w990001', '東區', 'SRID=4326;POINT(120.9700 24.8010)',
       ${sql.json([{ name: NAME, kind: '公園', osm: 'w990009', distance_m: 15 }])}),
      (${ID2}, 'hsc', 'w990002', '北區', 'SRID=4326;POINT(120.9600 24.8100)', '[]')`;
  // 已經有兩位會員提出同一個名稱
  const [a, b] = await Promise.all([people.create('member'), people.create('member')]);
  await sql`
    INSERT INTO naming_votes (candidate_id, user_id, action, name, name_key, basis) VALUES
      (${ID}, ${a!.id}, 'name', ${NAME}, ${NAME.toLowerCase()}, '實地確認'),
      (${ID}, ${b!.id}, 'name', ${NAME}, ${NAME.toLowerCase()}, 'OSM 地圖上可見的名稱')`;
  await revalidate(request);
});

test.afterAll(async ({ request }) => {
  await sql`DELETE FROM place_field_history WHERE place_id IN (${ID}, ${ID2})`;
  await sql`DELETE FROM places WHERE id IN (${ID}, ${ID2})`;
  await sql`DELETE FROM naming_candidates WHERE id IN (${ID}, ${ID2})`;
  await sql`UPDATE site_settings SET naming_threshold = ${originalThreshold}`;
  await sql`DELETE FROM admin_log WHERE action = 'set_naming_threshold' AND after = ${sql.json({ naming_threshold: 7 })}`;
  await people.cleanup();
  if (created.length) {
    await sql`DELETE FROM moderator_cities WHERE user_id IN (SELECT id FROM auth.users WHERE email = ANY(${created}))`;
    await sql`DELETE FROM auth.users WHERE email = ANY(${created})`;
  }
  await revalidate(request);
  await sql.end();
});

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test('縣市頁有「幫忙命名」入口；未登入送出會跳出登入視窗', async ({ page }) => {
  await page.goto('/hsinchu-city');
  await page.getByRole('link', { name: '幫忙命名（2 處）' }).click();
  await expect(page).toHaveURL(/\/hsinchu-city\/naming$/);
  await expect(page.getByText('不可以用 Google 地圖查名稱')).toBeVisible();
  // 只顯示參與人數，不顯示別人提的名稱
  await expect(page.getByText('已有 2 人參與').first()).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('實地確認）');
  await page.getByLabel('名稱', { exact: true }).fill('某公園');
  await page.getByLabel('依據').selectOption('實地確認');
  await page.getByRole('button', { name: '送出名稱' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('第 3 位會員（門檻 3 人）點附近的名稱送出 → 立刻加到地圖，入口少 1 處', async ({ page }) => {
  const email = `test-e2e-naming-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  await page.goto('/login?next=/hsinchu-city/naming');
  await loginWithEmail(page, email);
  await expect(page).toHaveURL(/\/hsinchu-city\/naming$/);

  await page.getByRole('button', { name: /東區．已有 2 人參與/ }).click();
  await page.getByRole('button', { name: new RegExp(NAME) }).click();
  await expect(page.getByLabel('名稱', { exact: true })).toHaveValue(NAME);
  await expect(page.getByLabel('依據')).toHaveValue('OSM 地圖上可見的名稱');
  await page.getByLabel(/我同意/).check(); // 第一次參與要同意服務條款
  await page.getByRole('button', { name: '送出名稱' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已加到地圖上' })).toBeVisible();
  // 清單只剩另一處
  await expect(page.getByRole('list', { name: '待命名的遊戲場' }).getByRole('button')).toHaveCount(
    1,
  );

  await page.goto(`/hsinchu-city/places/${ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAME);
  await page.goto('/hsinchu-city');
  await expect(page.getByRole('link', { name: '幫忙命名（1 處）' })).toBeVisible();

  // 我的貢獻：看得到結果
  await page.goto('/me');
  await expect(page.getByRole('link', { name: NAME })).toBeVisible();
  await expect(page.getByText('已命名，已加到地圖')).toBeVisible();
});

test('手機寬度也能使用：地圖與表單都看得到、沒有水平捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hsinchu-city/naming');
  await expect(page.getByLabel('名稱', { exact: true })).toBeVisible();
  await expect(page.getByTestId('naming-marker').first()).toBeAttached();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test('審核員在後台看到票數，可以直接命名（不用達到門檻）', async ({ page }) => {
  const [voter] = await Promise.all([people.create('member')]);
  await sql`
    INSERT INTO naming_votes (candidate_id, user_id, action, name, name_key, basis)
    VALUES (${ID2}, ${voter!.id}, 'name', 'test-北區小公園', 'test-北區小公園', '實地確認')`;
  // 先建立好審核員（負責新竹市），再用它的 Email 登入
  const mod = await people.create('moderator', { cities: ['hsc'] });
  await page.goto('/login?next=/admin/naming');
  await loginWithEmail(page, mod.email);
  await expect(page).toHaveURL(/\/admin\/naming$/);
  await page.goto('/admin/naming');
  const card = page.getByRole('region', { name: ID2 });
  await expect(card).toContainText('「test-北區小公園」1 票');
  await card.getByRole('button', { name: '命名並加到地圖' }).click();
  await expect(card).toHaveCount(0); // 已經決定的不再列出
  await page.goto(`/hsinchu-city/places/${ID2}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('test-北區小公園');
});

test('管理員在後台調整自動通過門檻，命名頁的說明跟著改；審核員看不到設定', async ({ page }) => {
  const admin = await people.create('admin');
  await page.goto('/login?next=/admin/naming');
  await loginWithEmail(page, admin.email);
  await expect(page).toHaveURL(/\/admin\/naming$/);
  const form = page.getByRole('form', { name: '自動通過門檻' });
  await expect(form.getByLabel('自動通過門檻（人）')).toHaveValue('3');
  await form.getByLabel('自動通過門檻（人）').fill('7');
  await form.getByRole('button', { name: '儲存' }).click();
  await expect(form.getByRole('status')).toHaveText('已改成 7 人。');
  await expect(page.locator('.cmeta').first()).toContainText('7 位會員提出相同名稱');
  await page.goto('/hsinchu-city/naming');
  await expect(page.getByText('7 位會員提出相同名稱，就會加到地圖上')).toBeVisible();
  await sql`UPDATE site_settings SET naming_threshold = 3`;

  // 審核員只看得到門檻，沒有設定表單
  await page.context().clearCookies();
  const mod = await people.create('moderator', { cities: ['hsc'] });
  await page.goto('/login?next=/admin/naming');
  await loginWithEmail(page, mod.email);
  await expect(page).toHaveURL(/\/admin\/naming$/);
  await expect(page.getByRole('form', { name: '自動通過門檻' })).toHaveCount(0);
});

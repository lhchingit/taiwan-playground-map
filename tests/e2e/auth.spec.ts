// 登入（Email 登入連結）、登出、回報修正的登入視窗、「我的貢獻」頁、刪除帳號。
// 登入信由本機 Supabase 的 Mailpit 收；測試帳號一律是 test-e2e-…@example.test，跑完刪除。
// Google 登入在本機預設沒有設定金鑰，只檢查按鈕顯示「尚未設定」。
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { adminSql } from '../db/helpers';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）的登入導回網址不同');

const sql = adminSql();
const PLACE = '/hsinchu-city/places/hsc-luguang-park';
// 這個 worker 建立的帳號與建議（桌機、手機兩個專案平行執行，只清自己的）
const created: string[] = [];
const suggestions: string[] = [];

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test.afterAll(async () => {
  if (suggestions.length) await sql`DELETE FROM edit_suggestions WHERE id = ANY(${suggestions})`;
  if (created.length) await sql`DELETE FROM auth.users WHERE email = ANY(${created})`;
  await sql.end();
});

function newEmail() {
  const email = `test-e2e-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  return email;
}

const userId = async (email: string) =>
  (await sql`SELECT id FROM auth.users WHERE email = ${email}`)[0]!.id as string;

test('Email 登入連結：從頁首登入、回到原頁顯示暱稱、登出', async ({ page }) => {
  await page.goto(PLACE);
  const nav = page.getByRole('navigation', { name: '帳號' });
  await nav.getByRole('link', { name: '登入', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  // Google 在本機沒有設定金鑰
  await expect(page.getByRole('button', { name: '用 Google 登入' })).toBeDisabled();
  await expect(page.getByText('（尚未設定）')).toBeVisible();

  await loginWithEmail(page, newEmail());
  await expect(page).toHaveURL(new RegExp(`${PLACE}$`));
  const me = nav.getByText(/^家長 \d{4}$/);
  await expect(me).toBeVisible();

  // 公開頁面登入後仍然是快取的靜態頁：不經過 session 更新、不設定 cookie
  const res = await page.request.get(PLACE);
  expect(res.headers()['set-cookie']).toBeUndefined();
  expect(res.headers()['cache-control'] ?? '').not.toMatch(/private|no-store/);

  await me.click();
  await nav.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(new RegExp(`${PLACE}$`));
  await expect(nav.getByRole('link', { name: '登入', exact: true })).toBeVisible();
});

test('未登入按「回報修正」跳出登入視窗；登入後回到場地頁並打開回報區塊', async ({ page }) => {
  await page.goto(PLACE);
  await page.getByRole('button', { name: '回報修正' }).click();
  const dialog = page.getByRole('dialog', { name: '登入' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('瀏覽地圖與場地資料不需要登入')).toBeVisible();

  await loginWithEmail(page, newEmail());
  await expect(page).toHaveURL(new RegExp(`${PLACE}\\?report=1$`));
  await expect(page.getByRole('form', { name: '回報修正' })).toBeVisible();
});

test('Email 登入在後台關閉時（上線初期只開 Google），登入視窗只顯示 Google', async ({ page }) => {
  await page.route('**/api/session', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({
      response: res,
      json: { ...body, providers: { google: true, email: false } },
    });
  });
  await page.goto(PLACE);
  await page.getByRole('button', { name: '回報修正' }).click();
  const dialog = page.getByRole('dialog', { name: '登入' });
  await expect(dialog.getByRole('button', { name: '用 Google 登入' })).toBeEnabled();
  await expect(dialog.getByText('（尚未設定）')).toHaveCount(0);
  await expect(dialog.getByLabel(/Email 登入連結/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '寄登入連結' })).toHaveCount(0);
});

test('設定了 Google 用戶端 ID 時用 Google 官方按鈕（decisions D28）；假的 token 會被拒絕', async ({
  page,
}) => {
  const clientId = 'e2e-test.apps.googleusercontent.com';
  await page.route('**/api/session', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({
      response: res,
      json: { ...body, providers: { google: true, email: false, googleClientId: clientId } },
    });
  });
  // 假的 Google Identity Services：記下 initialize 的參數，按鈕按下去就回傳一個假的 ID token
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { id: {
        initialize(o) { window.__gis = o; },
        renderButton(el, o) {
          window.__gisButton = o;
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = '假的 Google 按鈕';
          b.onclick = () => window.__gis.callback({ credential: 'aaa.bbb.ccc' });
          el.appendChild(b);
        },
      } } };`,
    }),
  );
  await page.goto(PLACE);
  await page.getByRole('button', { name: '回報修正' }).click();
  const dialog = page.getByRole('dialog', { name: '登入' });
  await expect(dialog.getByRole('button', { name: '假的 Google 按鈕' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '用 Google 登入' })).toHaveCount(0);

  const gis = await page.evaluate(() => {
    const w = window as unknown as {
      __gis: { client_id: string; nonce: string };
      __gisButton: { locale: string };
    };
    return { clientId: w.__gis.client_id, nonce: w.__gis.nonce, locale: w.__gisButton.locale };
  });
  expect(gis).toEqual({
    clientId,
    nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
    locale: 'zh-TW',
  });

  // 本機 Supabase 不接受假的 token：顯示錯誤，視窗還在、可以再試
  await dialog.getByRole('button', { name: '假的 Google 按鈕' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('登入沒有成功，請再試一次。');
  await expect(dialog).toBeVisible();
});

test('登入狀態還在查詢時按「回報修正」，等查完仍然跳出登入視窗', async ({ page }) => {
  // 模擬網路慢：/api/session 晚 1.5 秒回應，頁面一打開就按
  await page.route('**/api/session', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto(PLACE);
  await page.getByRole('button', { name: '回報修正' }).click();
  await expect(page.getByRole('dialog', { name: '登入' })).toBeVisible();
});

test('登入視窗可以用 Esc 關閉，不影響瀏覽', async ({ page }) => {
  await page.goto(PLACE);
  await page.getByRole('button', { name: '回報修正' }).click();
  await expect(page.getByRole('dialog', { name: '登入' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '登入' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('未登入打開 /me 會導到登入頁', async ({ page }) => {
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)me$/);
  await expect(page.getByRole('heading', { name: '登入', level: 1 })).toBeVisible();
});

test('我的貢獻：建議的狀態與原因、改暱稱、刪除帳號', async ({ page }) => {
  const email = newEmail();
  await page.goto('/login?next=/me');
  await loginWithEmail(page, email);
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText('還沒有資料。在場地頁按「回報修正」就可以提供修正。')).toBeVisible();

  // 提交介面在 P3(c)；這裡直接在資料庫建立兩筆建議（一筆審核中、一筆被退回）
  const id = await userId(email);
  const rows = await sql`
    INSERT INTO edit_suggestions (place_id, user_id, kind, payload, note) VALUES
      ('hsc-luguang-park', ${id}, 'attribute', '{"key":"footwash","value":"y"}', 'e2e'),
      ('hsc-luguang-park', ${id}, 'attribute', '{"key":"shade","value":"n"}', 'e2e')
    RETURNING id`;
  const ids = rows.map((r) => String(r.id));
  suggestions.push(...ids);
  await sql`UPDATE edit_suggestions SET status = 'rejected', reject_reason = 'unverifiable', reviewed_at = now()
            WHERE user_id = ${id} AND payload->>'key' = 'shade'`;
  await page.reload();
  const list = page.getByRole('region', { name: '我的修正建議' });
  await expect(list.getByText('洗腳池：有')).toBeVisible();
  await expect(list.getByText('審核中')).toBeVisible();
  await expect(list.getByText('未採納（無法查證）')).toBeVisible();

  // 改暱稱：頁首跟著更新
  await page.getByLabel('暱稱（其他人只看得到暱稱）').fill('小明爸爸');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByText('已更新暱稱。')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '帳號' }).getByText('小明爸爸')).toBeVisible();

  // 刪除帳號：要輸入「刪除」確認
  await page.getByLabel('請輸入「刪除」確認').fill('不要');
  await page.getByRole('button', { name: '刪除帳號' }).click();
  await expect(page.getByText('請輸入「刪除」兩個字確認。')).toBeVisible();
  await page.getByLabel('請輸入「刪除」確認').fill('刪除');
  await page.getByRole('button', { name: '刪除帳號' }).click();
  await expect(page).toHaveURL(/\/hsinchu-city/);
  await expect(page.getByRole('link', { name: '登入', exact: true })).toBeVisible();

  expect(await sql`SELECT 1 FROM auth.users WHERE id = ${id}`).toHaveLength(0);
  // 建議保留，但不再有提交者
  const left = await sql`SELECT user_id FROM edit_suggestions WHERE id = ANY(${ids})`;
  expect(left.map((r) => r.user_id)).toEqual([null, null]);
});

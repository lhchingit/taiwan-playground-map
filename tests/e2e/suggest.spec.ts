// 回報修正（P3(c)）：登入後在綠光公園提交四種修正建議、第一次同意服務條款、重複回報與撤回（D29）、Turnstile。
// Turnstile 用 Cloudflare 官方的測試金鑰（pnpm env:local），一定通過；驗證失敗用擋掉 Turnstile 腳本模擬。
// 審核員核准後場地頁顯示新資料在 P3(e) 測試。
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { adminSql } from '../db/helpers';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）的登入導回網址不同');

const sql = adminSql();
const PLACE = '/hsinchu-city/places/hsc-luguang-park';
// 這個 worker 建立的帳號（桌機、手機兩個專案平行執行，只清自己的）
const created: string[] = [];

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test.afterAll(async () => {
  if (created.length) {
    await sql`DELETE FROM edit_suggestions
              WHERE user_id IN (SELECT id FROM auth.users WHERE email = ANY(${created}))`;
    await sql`DELETE FROM auth.users WHERE email = ANY(${created})`;
  }
  await sql.end();
});

async function login(page: Page) {
  const email = `test-e2e-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  await page.goto(`/login?next=${encodeURIComponent(PLACE)}`);
  await loginWithEmail(page, email);
  await expect(page).toHaveURL(new RegExp(`${PLACE}$`));
  const [u] = await sql`SELECT id FROM auth.users WHERE email = ${email}`;
  return u!.id as string;
}

/** 已經同意過條款（直接寫資料庫）。登入時頁面已經查過一次登入狀態，要重新載入才會拿到新的狀態 */
async function acceptTerms(page: Page, id: string) {
  await sql`UPDATE profiles SET terms_accepted_at = now() WHERE id = ${id}`;
  await page.reload();
}

async function openForm(page: Page) {
  await page.getByRole('button', { name: '回報修正' }).click();
  const form = page.getByRole('form', { name: '回報修正' });
  await expect(form).toBeVisible();
  return form;
}

/** 等 Turnstile 給 token 後送出 */
async function submit(page: Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: '送出修正建議' }).click();
}

const mine = (id: string) =>
  sql`SELECT kind, payload, status FROM edit_suggestions WHERE user_id = ${id} ORDER BY id`;

test('回報「洗腳池：有」：第一次同意條款、我的貢獻顯示審核中、重複回報被擋下', async ({ page }) => {
  const id = await login(page);
  let form = await openForm(page);
  await form.getByLabel('要修正的項目').selectOption('footwash');
  await form.getByRole('button', { name: '有', exact: true }).click();
  await form.getByLabel('補充說明（選填）').fill('東側入口');
  // 第一次：要同意服務條款，並提醒暱稱
  await expect(form.getByText(/其他人會看到你的暱稱「家長 \d{4}」/)).toBeVisible();
  await form.getByRole('checkbox').check();
  await submit(page);
  await expect(page.getByText('已收到你的修正建議，審核通過後會更新。')).toBeVisible();

  expect(await mine(id)).toEqual([
    {
      kind: 'attribute',
      payload: { key: 'footwash', value: 'y', note: '東側入口' },
      status: 'pending',
    },
  ]);
  const [p] = await sql`SELECT terms_accepted_at FROM profiles WHERE id = ${id}`;
  expect(p?.terms_accepted_at).not.toBeNull();

  await page.goto('/me');
  const list = page.getByRole('region', { name: '我的修正建議' });
  await expect(list.getByText('洗腳池：有')).toBeVisible();
  await expect(list.getByText('審核中')).toBeVisible();

  // 同一個項目再回報一次：已經同意過條款，不再顯示勾選框
  await page.goto(PLACE);
  form = await openForm(page);
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await form.getByLabel('要修正的項目').selectOption('footwash');
  await form.getByRole('button', { name: '沒有', exact: true }).click();
  await submit(page);
  await expect(form.getByText('你已經回報過，正在審核中。')).toBeVisible();
  expect(await mine(id)).toHaveLength(1);

  // 撤回那一筆（decisions D29，頁面內確認）後重新送出
  await form.getByRole('button', { name: '撤回那一筆' }).click();
  await form.getByRole('group', { name: '確認撤回' }).getByRole('button', { name: '撤回' }).click();
  await expect(form.getByText('已撤回，可以重新送出。')).toBeVisible();
  await submit(page);
  await expect(page.getByText('已收到你的修正建議，審核通過後會更新。')).toBeVisible();
  // 出錯後表單內容保留：重新送出的仍然是「洗腳池：沒有」
  expect((await mine(id)).map((r) => [r.payload.key, r.payload.value, r.status])).toEqual([
    ['footwash', 'y', 'withdrawn'],
    ['footwash', 'n', 'pending'],
  ]);

  // 我的貢獻：撤回另一筆，狀態變成「已撤回」，撤回按鈕消失
  await page.goto('/me');
  const items = page.getByRole('region', { name: '我的修正建議' }).getByRole('listitem');
  const pendingItem = items.filter({ hasText: '洗腳池：沒有' });
  await pendingItem.getByRole('button', { name: '撤回' }).click();
  await pendingItem
    .getByRole('group', { name: '確認撤回' })
    .getByRole('button', { name: '撤回' })
    .click();
  await expect(pendingItem.getByText('已撤回')).toBeVisible();
  await expect(pendingItem.getByRole('button', { name: '撤回' })).toHaveCount(0);
  await expect(items.filter({ hasText: '已撤回' })).toHaveCount(2);
  expect((await mine(id)).map((r) => r.status)).toEqual(['withdrawn', 'withdrawn']);
});

test('停車、基本資料、封閉或維修', async ({ page }) => {
  const id = await login(page);
  await acceptTerms(page, id);

  let form = await openForm(page);
  await form.getByRole('button', { name: '停車' }).click();
  await form.getByLabel('停車類型').selectOption('lot');
  await form.getByLabel('費用', { exact: true }).selectOption('paid');
  await form.getByLabel('停車格數（選填）').fill('40');
  await form.getByLabel('費用說明（選填）').fill('每小時 30 元');
  await submit(page);
  await expect(page.getByText('已收到你的修正建議')).toBeVisible();

  await page.reload();
  form = await openForm(page);
  await form.getByRole('button', { name: '基本資料' }).click();
  await form.getByLabel('欄位').selectOption('hours');
  await form.getByLabel('內容').fill('06:00–22:00');
  await submit(page);
  await expect(page.getByText('已收到你的修正建議')).toBeVisible();

  await page.reload();
  form = await openForm(page);
  await form.getByRole('button', { name: '封閉或維修' }).click();
  await form.getByLabel('原因').fill('遊具維修中');
  await form.getByLabel('預計恢復日期（選填）').fill('2026-12-31');
  await submit(page);
  await expect(page.getByText('已收到你的修正建議')).toBeVisible();

  expect(await mine(id)).toEqual([
    {
      kind: 'parking',
      payload: { type: 'lot', fee: 'paid', spaces: 40, fee_note: '每小時 30 元' },
      status: 'pending',
    },
    { kind: 'field', payload: { field: 'hours', value: '06:00–22:00' }, status: 'pending' },
    { kind: 'closure', payload: { reason: '遊具維修中', until: '2026-12-31' }, status: 'pending' },
  ]);
});

test('回報類型、實際狀況的按鈕完整顯示，不會被外框裁掉', async ({ page }) => {
  const id = await login(page);
  await acceptTerms(page, id);
  const form = await openForm(page);
  for (const name of ['回報類型', '實際狀況']) {
    const group = form.getByRole('group', { name });
    // 外框不能裁切（共用的 .seg 是膠囊形、overflow: hidden，頭尾按鈕的角會被切掉）
    expect(await group.evaluate((el) => getComputedStyle(el).overflow)).not.toBe('hidden');
    const outer = (await group.boundingBox())!;
    for (const button of await group.getByRole('button').all()) {
      const b = (await button.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
    }
  }
});

test('格式錯誤時顯示原因，不會送出', async ({ page }) => {
  const id = await login(page);
  await acceptTerms(page, id);
  const form = await openForm(page);
  await form.getByRole('button', { name: '停車' }).click();
  // 瀏覽器的數字欄位會先擋掉小數；關掉瀏覽器的檢查，確認伺服器端也會檢查
  await form.evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await form.getByLabel('停車格數（選填）').fill('2.5');
  await submit(page);
  await expect(form.getByText('停車格數要填 0 以上的整數。')).toBeVisible();
  expect(await mine(id)).toHaveLength(0);
});

test('Turnstile 驗證沒有通過時不會送出', async ({ page }) => {
  const id = await login(page);
  await acceptTerms(page, id);
  // 擋掉 Turnstile：沒有 token
  await page.route(/challenges\.cloudflare\.com/, (r) => r.abort());
  await page.reload();
  const form = await openForm(page);
  await form.getByLabel('要修正的項目').selectOption('slide');
  await page.getByRole('button', { name: '送出修正建議' }).click();
  await expect(form.getByText('驗證沒有通過，請再試一次。')).toBeVisible();
  expect(await mine(id)).toHaveLength(0);
});

test('服務條款與隱私權政策：草稿標示、ODbL、Turnstile', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: '服務條款', level: 1 })).toBeVisible();
  await expect(page.getByText('草稿，待法律審閱')).toBeVisible();
  await expect(page.getByRole('link', { name: /ODbL/ })).toHaveAttribute(
    'href',
    'https://opendatacommons.org/licenses/odbl/1-0/',
  );
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: '隱私權政策', level: 1 })).toBeVisible();
  await expect(page.getByText('草稿，待法律審閱')).toBeVisible();
  await expect(page.getByText(/Cloudflare Turnstile/)).toBeVisible();
});

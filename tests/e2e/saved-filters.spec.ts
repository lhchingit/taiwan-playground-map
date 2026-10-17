// 我的篩選（decisions D27）：沒登入看到提示 → 從篩選面板登入（條件留在網址）→ 儲存、套用、改名、刪除、存滿 5 組。
// 權限與上限的完整測試在 tests/db/saved-filters.test.ts。
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { adminSql } from '../db/helpers';
import { expected, TOTAL } from './expected';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）的登入導回網址不同');
test.skip(({ isMobile }) => isMobile, '桌機版面（手機的篩選面板要先展開，流程相同）');

const sql = adminSql();
const created: string[] = [];

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test.afterAll(async () => {
  if (created.length) await sql`DELETE FROM auth.users WHERE email = ANY(${created})`;
  await sql.end();
});

test('我的篩選：登入後儲存、套用、改名、刪除；最多 5 組', async ({ page }) => {
  const panel = page.locator('#filter-body');
  const count = page.getByTestId('count');
  const both = expected('沙坑＋廁所');

  await page.goto('/hsinchu-city?play=sandpit&amen=toilet');
  await expect(panel.getByText('登入後可以儲存篩選條件')).toBeVisible();
  await panel.getByRole('button', { name: '登入', exact: true }).click();

  const email = `test-e2e-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  await loginWithEmail(page, email);
  // 登入後回到原畫面，條件還在
  await expect(page).toHaveURL(/\/hsinchu-city\?play=sandpit&amen=toilet$/);
  await expect(count).toHaveText(String(both.expected_count));

  // 儲存：名稱預設是條件摘要
  await expect(panel.getByText('0／5')).toBeVisible();
  await panel.getByRole('button', { name: '＋儲存目前條件' }).click();
  await expect(panel.getByLabel('名稱')).toHaveValue('沙坑＋廁所');
  await panel.getByRole('button', { name: '儲存', exact: true }).click();
  const saved = panel.getByRole('button', { name: '沙坑＋廁所', exact: true });
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByText('目前條件已經存成「沙坑＋廁所」。')).toBeVisible();

  // 清除後一鍵套用
  await page.getByRole('button', { name: '清除篩選' }).click();
  await expect(count).toHaveText(String(TOTAL));
  await expect(saved).toHaveAttribute('aria-pressed', 'false');
  await saved.click();
  await expect(count).toHaveText(String(both.expected_count));
  await expect(page).toHaveURL(/\?play=sandpit&amen=toilet$/);

  // 改名
  await panel.getByRole('button', { name: '改名「沙坑＋廁所」' }).click();
  await panel.getByLabel('新的名稱').fill('週末放電');
  await panel.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(panel.getByRole('button', { name: '週末放電', exact: true })).toBeVisible();

  // 存滿 5 組：不能再存
  const [u] = await sql`SELECT id FROM auth.users WHERE email = ${email}`;
  for (let i = 2; i <= 5; i++) {
    await sql`INSERT INTO saved_filters (user_id, name, query)
              VALUES (${u!.id as string}, ${`第 ${i} 組`}, ${`km=${i}`})`;
  }
  await page.goto('/hsinchu-city?play=slide');
  await expect(panel.getByText('5／5')).toBeVisible();
  await expect(panel.getByText('最多 5 組，請先刪掉一組。')).toBeVisible();
  await expect(panel.getByRole('button', { name: '＋儲存目前條件' })).toBeDisabled();

  // 刪除（頁面內確認）
  await panel.getByRole('button', { name: '刪除「週末放電」' }).click();
  await panel
    .getByRole('group', { name: '確認刪除' })
    .getByRole('button', { name: '刪除' })
    .click();
  await expect(panel.getByRole('button', { name: '週末放電', exact: true })).toHaveCount(0);
  await expect(panel.getByText('4／5')).toBeVisible();
  await expect(panel.getByRole('button', { name: '＋儲存目前條件' })).toBeEnabled();
});

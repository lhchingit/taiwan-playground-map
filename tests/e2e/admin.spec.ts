// 審核後台（P3(e1)）：回報 → 審核員核准 → 場地頁更新；退回、封閉與恢復開放、意見不一致、批次、權限。
// 會改動真實場地（綠光公園）的資料，所以在 playwright.config.ts 的 moderation 專案、其他 e2e 跑完之後才執行；
// 跑完把綠光公園還原、清掉測試帳號與建議，並清除網站快取。
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminSql } from '../db/helpers';
import { E2E_REVALIDATE_SECRET } from './constants';
import { loginWithEmail } from './login';

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, '外部伺服器（例如 Docker）不知道清快取的密鑰');
test.describe.configure({ mode: 'serial' });

const sql = adminSql();
const PLACE_ID = 'hsc-luguang-park';
const PLACE = `/hsinchu-city/places/${PLACE_ID}`;
const created: string[] = [];
let original: Record<string, unknown>;
let historyStart = { attr: 0, field: 0 };

test.beforeAll(async () => {
  const [p] =
    await sql`SELECT hours, surface, status, status_until, status_note, hours_source, hours_verified_at,
                               surface_source, surface_verified_at, status_source, status_verified_at
                        FROM places WHERE id = ${PLACE_ID}`;
  original = p!;
  const [h] =
    await sql`SELECT COALESCE((SELECT max(id) FROM place_attribute_history), 0)::int AS attr,
                               COALESCE((SELECT max(id) FROM place_field_history), 0)::int AS field`;
  historyStart = { attr: h!.attr as number, field: h!.field as number };
});

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

test.afterAll(async ({ request }) => {
  // 還原綠光公園：使用者來源的屬性、停車、基本欄位
  // 新增場地的測試建立的場地（名稱一律 test- 開頭）
  const made =
    await sql`SELECT id FROM places WHERE created_from_suggestion IS NOT NULL AND name LIKE 'test-%'`;
  const madeIds = made.map((r) => r.id as string);
  if (madeIds.length) {
    await sql`DELETE FROM places WHERE id = ANY(${madeIds})`;
    await sql`DELETE FROM place_field_history WHERE place_id = ANY(${madeIds})`;
  }
  await sql`DELETE FROM place_attributes WHERE place_id = ${PLACE_ID} AND source_id = 'user'`;
  await sql`DELETE FROM place_parking WHERE place_id = ${PLACE_ID} AND source_id = 'user'`;
  await sql`UPDATE places SET ${sql(original)} WHERE id = ${PLACE_ID}`;
  await sql`DELETE FROM place_attribute_history WHERE id > ${historyStart.attr}`;
  await sql`DELETE FROM place_field_history WHERE id > ${historyStart.field}`;
  if (created.length) {
    await sql`DELETE FROM edit_suggestions
              WHERE user_id IN (SELECT id FROM auth.users WHERE email = ANY(${created}))
                 OR reviewed_by IN (SELECT id FROM auth.users WHERE email = ANY(${created}))`;
    await sql`DELETE FROM admin_log
              WHERE actor IN (SELECT id FROM auth.users WHERE email = ANY(${created}))
                 OR target IN (SELECT id FROM auth.users WHERE email = ANY(${created}))`;
    await sql`DELETE FROM auth.users WHERE email = ANY(${created})`;
  }
  await request.post('/api/revalidate', {
    headers: { Authorization: `Bearer ${E2E_REVALIDATE_SECRET}` },
    data: { city: 'hsc' },
  });
  await sql.end();
});

/** 新的瀏覽器分頁＋登入；role 是 moderator 時指派新竹市 */
async function person(browser: Browser, role: 'member' | 'moderator' | 'admin') {
  const email = `test-e2e-${role}-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  const page = await (await browser.newContext()).newPage();
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
  await page.goto(`/login?next=${encodeURIComponent(PLACE)}`);
  await loginWithEmail(page, email);
  await expect(page).toHaveURL(new RegExp(`${PLACE}$`));
  const [u] = await sql`SELECT id FROM auth.users WHERE email = ${email}`;
  const id = u!.id as string;
  await sql`UPDATE profiles SET terms_accepted_at = now() WHERE id = ${id}`;
  if (role === 'admin') await sql`UPDATE profiles SET role = 'admin' WHERE id = ${id}`;
  if (role === 'moderator') {
    await sql`UPDATE profiles SET role = 'moderator' WHERE id = ${id}`;
    await sql`INSERT INTO moderator_cities (user_id, city) VALUES (${id}, 'hsc')`;
  }
  // 登入時頁面已經查過一次登入狀態（同意條款、角色），重新載入才會拿到剛設定的
  await page.reload();
  return { page, id };
}

/** 用資料庫直接建立一筆待審建議（提交介面在 suggest.spec.ts 測過） */
async function pending(userId: string, kind: string, payload: object) {
  const [r] = await sql`INSERT INTO edit_suggestions (place_id, user_id, kind, payload)
                        VALUES (${PLACE_ID}, ${userId}, ${kind}, ${sql.json(payload as never)}) RETURNING id`;
  return Number(r!.id);
}

const card = (page: Page, id: number) =>
  page.getByRole('listitem', { name: new RegExp(`^#${id} `) });

test('回報洗腳池 → 審核員核准 → 場地頁顯示「有」與使用者回報來源 → 我的貢獻顯示已採納', async ({
  browser,
}) => {
  const member = await person(browser, 'member');
  // 會員用介面回報
  await member.page.getByRole('button', { name: '回報修正' }).click();
  const form = member.page.getByRole('form', { name: '回報修正' });
  await form.getByLabel('要修正的項目').selectOption('footwash');
  await form.getByRole('button', { name: '有', exact: true }).click();
  await expect(member.page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await member.page.getByRole('button', { name: '送出修正建議' }).click();
  await expect(member.page.getByText('已收到你的修正建議')).toBeVisible();
  await member.page.goto('/me');
  await expect(
    member.page.getByRole('region', { name: '我的修正建議' }).getByText('審核中', { exact: true }),
  ).toBeVisible();
  const [s] = await sql`SELECT id FROM edit_suggestions WHERE user_id = ${member.id}`;
  const id = Number(s!.id);

  // 審核員：頁首選單有「審核後台」
  const mod = await person(browser, 'moderator');
  await mod.page.reload();
  await mod.page
    .getByRole('navigation', { name: '導覽' })
    .getByText(/^家長 \d{4}$/)
    .click();
  await mod.page.getByRole('link', { name: '審核後台' }).click();
  await expect(mod.page).toHaveURL(/\/admin$/);
  const c = card(mod.page, id);
  await expect(c).toContainText('綠光公園');
  await expect(c).toContainText('還沒有資料'); // 目前
  await expect(c).toContainText('洗腳池：有'); // 建議
  await expect(c).toContainText('被採納過 0 次');
  await c.getByRole('button', { name: '核准' }).click();
  await expect(mod.page.getByText(`#${id}：已核准並套用`)).toBeVisible();

  // 場地頁立刻更新（核准時清除快取）
  await member.page.goto(PLACE);
  const row = member.page
    .getByRole('region', { name: '生活機能' })
    .locator('.arow', { hasText: '洗腳池' });
  await expect(row).toContainText('使用者回報（已審核）');
  await expect(row.getByRole('img', { name: '有' })).toBeVisible();
  await member.page.goto('/me');
  await expect(
    member.page.getByRole('region', { name: '我的修正建議' }).getByText('已採納', { exact: true }),
  ).toBeVisible();
});

test('退回並選「無法查證」→ 我的貢獻顯示未採納與原因', async ({ browser }) => {
  const member = await person(browser, 'member');
  const id = await pending(member.id, 'attribute', { key: 'shade', value: 'n' });
  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  const c = card(mod.page, id);
  await c.getByLabel('退回原因').selectOption('unverifiable');
  await c.getByRole('button', { name: '退回' }).click();
  await expect(mod.page.getByText(`#${id}：已退回`)).toBeVisible();
  await member.page.goto('/me');
  await expect(member.page.getByText('未採納（無法查證）')).toBeVisible();
});

test('封閉：核准前改成已封閉 → 場地頁顯示提醒 → 恢復開放後提醒消失', async ({ browser }) => {
  const member = await person(browser, 'member');
  const id = await pending(member.id, 'closure', { reason: '遊具維修中', until: '2099-12-31' });
  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  const c = card(mod.page, id);
  await c.getByLabel('狀態').selectOption('closed');
  await c.getByLabel('原因', { exact: true }).fill('整修封閉');
  await c.getByRole('button', { name: '核准' }).click();
  await expect(mod.page.getByText(`#${id}：已核准並套用`)).toBeVisible();

  await member.page.goto(PLACE);
  await expect(member.page.getByRole('note').filter({ hasText: '已封閉' })).toContainText(
    '已封閉：整修封閉（預計 2099-12-31 恢復）',
  );

  await mod.page.reload();
  const closed = mod.page.getByRole('region', { name: '維修中／已封閉的場地' });
  await expect(closed).toContainText('綠光公園');
  await closed.getByRole('button', { name: '恢復開放' }).click();
  await expect(closed.getByText('已恢復開放')).toBeVisible();
  await member.page.goto(PLACE);
  await expect(member.page.getByText('已封閉：整修封閉')).toHaveCount(0);
});

test('意見不一致的建議放在同一組；批次退回', async ({ browser }) => {
  const a = await person(browser, 'member');
  const b = await person(browser, 'member');
  const id1 = await pending(a.id, 'attribute', { key: 'lighting', value: 'y' });
  const id2 = await pending(b.id, 'attribute', { key: 'lighting', value: 'n' });
  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  const group = mod.page.locator('.admin-group', { has: card(mod.page, id1) });
  await expect(group.getByText('意見不一致：同一個項目有 2 筆不同的建議')).toBeVisible();
  await expect(group.locator(card(mod.page, id2))).toBeVisible();

  await card(mod.page, id1).getByRole('checkbox').check();
  await card(mod.page, id2).getByRole('checkbox').check();
  const batch = mod.page.locator('#batch');
  await batch.getByLabel('退回原因').selectOption('duplicate');
  await batch.getByRole('button', { name: '一次退回' }).click();
  await expect(mod.page.getByText(`#${id1}：已退回`)).toBeVisible();
  await expect(mod.page.getByText(`#${id2}：已退回`)).toBeVisible();
  const rows =
    await sql`SELECT status, reject_reason FROM edit_suggestions WHERE id IN (${id1}, ${id2})`;
  expect(rows).toEqual([
    { status: 'rejected', reject_reason: 'duplicate' },
    { status: 'rejected', reject_reason: 'duplicate' },
  ]);
});

test('會員打開審核後台會被導回首頁；頁首沒有審核後台的入口', async ({ browser }) => {
  const member = await person(browser, 'member');
  await member.page.goto('/admin');
  await expect(member.page).toHaveURL(/\/hsinchu-city$/);
  await member.page.goto(PLACE);
  await member.page
    .getByRole('navigation', { name: '導覽' })
    .getByText(/^家長 \d{4}$/)
    .click();
  await expect(member.page.getByRole('link', { name: '我的貢獻' })).toBeVisible();
  await expect(member.page.getByRole('link', { name: '審核後台' })).toHaveCount(0);
});

test('修改紀錄：核准後從紀錄頁回到修改之前，場地頁恢復原本的值與來源', async ({ browser }) => {
  const member = await person(browser, 'member');
  // 綠光公園的洗手台原本是「有」（網友評論線索）；改成「沒有」再還原
  const id = await pending(member.id, 'attribute', { key: 'handwash', value: 'n' });
  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  await card(mod.page, id).getByRole('button', { name: '核准' }).click();
  await expect(mod.page.getByText(`#${id}：已核准並套用`)).toBeVisible();

  const handwash = () =>
    member.page.getByRole('region', { name: '生活機能' }).locator('.arow', { hasText: '洗手台' });
  await member.page.goto(PLACE);
  await expect(handwash()).toContainText('使用者回報（已審核）');

  await mod.page.goto(`/admin/places/${PLACE_ID}`);
  await expect(mod.page.getByRole('heading', { name: '修改紀錄：綠光公園' })).toBeVisible();
  const table = mod.page.getByRole('region', { name: '設施與生活機能' });
  const row = table.getByRole('row').filter({ hasText: '洗手台' }).first();
  await expect(row).toContainText('有（網友評論線索');
  await expect(row).toContainText('無（使用者回報（已審核））');
  await row.getByRole('button', { name: '回到這筆修改之前' }).click();
  await expect(mod.page.getByText(/已還原到紀錄 #\d+ 之前的狀態/)).toBeVisible();
  // 還原本身也是一筆紀錄（最新的在最上面）
  await expect(table.getByRole('row').filter({ hasText: '洗手台' }).first()).toContainText(
    '有（網友評論線索',
  );

  await member.page.goto(PLACE);
  await expect(handwash()).not.toContainText('使用者回報（已審核）');
  await expect(handwash()).toContainText('網友評論線索');
});

test('管理員：用 Email 搜尋、改成審核員並指派新竹市、停權與解除停權', async ({ browser }) => {
  const target = await person(browser, 'member');
  const [t] = await sql`SELECT email FROM auth.users WHERE id = ${target.id}`;
  const admin = await person(browser, 'admin');

  await admin.page.goto('/admin');
  await admin.page.getByRole('link', { name: '使用者管理' }).click();
  await expect(admin.page).toHaveURL(/\/admin\/users$/);
  await admin.page.getByLabel('搜尋暱稱或 Email').fill(String(t!.email));
  await admin.page.getByRole('button', { name: '搜尋' }).click();
  const row = admin.page.getByRole('listitem', { name: /^使用者 家長 \d{4}$/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(String(t!.email));

  await row.getByLabel('角色').selectOption('moderator');
  await row.getByRole('button', { name: '儲存角色' }).click();
  await expect(admin.page.getByText(/已更新.*的角色/)).toBeVisible();
  await row.getByRole('checkbox', { name: '新竹市' }).check();
  await row.getByRole('button', { name: '儲存負責縣市' }).click();
  await expect(admin.page.getByText(/已更新.*的負責縣市/)).toBeVisible();
  await expect(row).toContainText('負責：新竹市');

  // 對方的頁首出現審核後台
  await target.page.goto(PLACE);
  await target.page
    .getByRole('navigation', { name: '導覽' })
    .getByText(/^家長 \d{4}$/)
    .click();
  await expect(target.page.getByRole('link', { name: '審核後台' })).toBeVisible();

  await row.getByLabel('停權原因').fill('測試停權');
  await row.getByRole('button', { name: '停權' }).click();
  await expect(admin.page.getByText(/已停權/)).toBeVisible();
  await expect(row).toContainText('停權中');
  await target.page.goto('/me');
  await expect(target.page.getByText('帳號已停權：測試停權')).toBeVisible();

  await row.getByRole('button', { name: '解除停權' }).click();
  await expect(admin.page.getByText(/已解除.*的停權/)).toBeVisible();
  await target.page.reload();
  await expect(target.page.getByText('帳號已停權')).toHaveCount(0);

  // 操作紀錄
  const log = admin.page.getByRole('region', { name: '最近的管理員操作' });
  await expect(log).toContainText('角色：會員 → 審核員');
  await expect(log).toContainText('負責縣市：無 → 新竹市');
  await expect(log).toContainText('停權：測試停權');
  await expect(log).toContainText('解除停權');

  // 自己那一列不能操作
  await admin.page.getByLabel('搜尋暱稱或 Email').fill('');
  const [a] = await sql`SELECT email FROM auth.users WHERE id = ${admin.id}`;
  await admin.page.getByLabel('搜尋暱稱或 Email').fill(String(a!.email));
  await admin.page.getByRole('button', { name: '搜尋' }).click();
  await expect(admin.page.getByText('不能修改自己的角色或停權自己')).toBeVisible();
});

test('審核員看不到使用者管理；打開 /admin/users 會被導回審核後台', async ({ browser }) => {
  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  await expect(mod.page.getByRole('heading', { name: '審核後台' })).toBeVisible();
  await expect(mod.page.getByRole('link', { name: '使用者管理' })).toHaveCount(0);
  await mod.page.goto('/admin/users');
  await expect(mod.page).toHaveURL(/\/admin$/);
});

/** 在首頁地圖上點一下標出新場地；點到既有的標記時換個位置再試 */
async function pickOnMap(page: Page) {
  const map = page.getByRole('region', { name: '地圖' });
  // 等地圖載入完成（「地圖載入中…」消失）才點
  await expect(page.getByText('地圖載入中…')).toHaveCount(0, { timeout: 15_000 });
  const box = (await map.boundingBox())!;
  // 從地圖中心附近往外找一個沒有標記（場地、出發點）的位置再點：場地多的時候中心附近常被標記蓋住
  for (const r of [30, 60, 90, 120]) {
    for (const [ux, uy] of [
      [1, -1],
      [-1, 1],
      [1, 1],
      [-1, -1],
      [0, 1],
      [1, 0],
    ] as const) {
      const x = box.x + box.width / 2 + ux * r;
      const y = box.y + box.height / 2 + uy * r;
      const covered = await page.evaluate(
        ([px, py]) => !!document.elementFromPoint(px!, py!)?.closest('.maplibregl-marker'),
        [x, y],
      );
      if (covered) continue;
      await page.mouse.click(x, y);
      try {
        await page.getByTestId('newplace-pin').waitFor({ timeout: 2_000 });
        return;
      } catch {
        // 沒有標到：換個位置再試
      }
    }
  }
  throw new Error('沒有標到新場地的位置');
}

test('回報新場地 → 審核員修改名稱後核准 → 地圖、場地頁、我的貢獻', async ({ browser }) => {
  const member = await person(browser, 'member');
  await member.page.goto('/hsinchu-city');
  await member.page.getByRole('button', { name: '回報新場地' }).click();
  const panel = member.page.getByRole('region', { name: '回報新場地' });
  await expect(panel).toContainText('在地圖上點出場地的位置');
  await expect(panel).toContainText('不要照 Google 地圖的位置標');
  await pickOnMap(member.page);
  const form = member.page.getByRole('form', { name: '新場地' });
  await expect(form).toContainText('新竹市');
  await form.getByLabel('場地名稱').fill('test-e2e 新公園');
  await form.getByLabel('地址（選填）').fill('新竹市測試路 1 號');
  await expect(member.page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await form.getByRole('button', { name: '送出新場地' }).click();
  await expect(panel.getByText('已收到你的回報，審核通過後會出現在地圖上。')).toBeVisible();
  const [s] = await sql`SELECT id, payload FROM edit_suggestions
                        WHERE user_id = ${member.id} AND kind = 'new_place'`;
  const id = Number(s!.id);
  expect(s!.payload).toMatchObject({ name: 'test-e2e 新公園', city: 'hsc' });

  await member.page.goto('/me');
  const mine = member.page.getByRole('region', { name: '我的修正建議' });
  await expect(mine).toContainText('test-e2e 新公園');
  await expect(mine.getByText('審核中', { exact: true })).toBeVisible();

  const mod = await person(browser, 'moderator');
  await mod.page.goto('/admin');
  const c = card(mod.page, id);
  await expect(c).toContainText('新增場地');
  await expect(c.getByRole('link', { name: '在 OpenStreetMap 上確認位置' })).toHaveAttribute(
    'href',
    /openstreetmap\.org\/\?mlat=/,
  );
  await c.getByLabel('名稱').fill('test-e2e 新公園（修正）');
  await c.getByRole('button', { name: '核准' }).click();
  await expect(mod.page.getByText(`#${id}：已核准並套用`)).toBeVisible();

  const [p] = await sql`SELECT place_id FROM edit_suggestions WHERE id = ${id}`;
  const placeId = String(p!.place_id);
  expect(placeId).toMatch(/^hsc-user-\d{3,}$/);

  // 首頁的場地清單 API 與場地頁
  const api = await member.page.request.get('/api/cities/hsc/places');
  expect(((await api.json()) as { id: string }[]).some((x) => x.id === placeId)).toBe(true);
  await member.page.goto(`/hsinchu-city/places/${placeId}`);
  await expect(member.page.getByRole('heading', { level: 1 })).toHaveText(
    'test-e2e 新公園（修正）',
  );
  await expect(
    member.page.getByText(/使用者在 OpenStreetMap 地圖上標示，審核員確認/),
  ).toBeVisible();
  await expect(member.page.getByRole('region', { name: '遊樂設施' })).toContainText('還沒有資料');

  // 我的貢獻連到新場地
  await member.page.goto('/me');
  await expect(
    member.page.getByRole('region', { name: '我的修正建議' }).getByRole('link', {
      name: 'test-e2e 新公園（修正）',
    }),
  ).toHaveAttribute('href', `/hsinchu-city/places/${placeId}`);
});

test('未登入按「回報新場地」→ 登入視窗 → 登入後直接進入標點模式', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
  await page.goto('/hsinchu-city');
  await page.getByRole('button', { name: '回報新場地' }).click();
  await expect(page.getByRole('dialog', { name: '登入' })).toBeVisible();
  const email = `test-e2e-newplace-${randomUUID().slice(0, 8)}@example.test`;
  created.push(email);
  await loginWithEmail(page, email);
  // ?newplace=1 只用來觸發一次；首頁把篩選條件同步到網址時會拿掉它（重新整理不會再進入標點模式）
  await expect(page).toHaveURL(/\/hsinchu-city/);
  await expect(page.getByRole('region', { name: '回報新場地' })).toContainText(
    '在地圖上點出場地的位置',
  );
});

// 首頁 e2e。地圖圖磚與 Nominatim 在測試中攔截，不連外網；定位權限未授予，出發點維持範例（新竹火車站）。
// 前提：本機 Supabase 已 db reset + seed，並執行過 pnpm env:local。
import { expect, test, type Page } from '@playwright/test';

/** 新竹市與新竹縣交界附近（竹北市與新竹市東區之間）。只用在攔截的 Nominatim 回應。 */
const BORDER = { lat: 24.8215, lng: 121.0105 };

async function setup(page: Page) {
  await page.route(/tiles\.openfreemap\.org|basemaps\.cartocdn\.com/, (r) => r.abort());
  await page.route(/nominatim\.openstreetmap\.org/, (r) =>
    r.fulfill({
      json: [
        {
          lat: String(BORDER.lat),
          lon: String(BORDER.lng),
          name: '縣市交界測試點',
          display_name: '縣市交界測試點, 新竹, 臺灣',
        },
      ],
    }),
  );
}

const count = (page: Page) => page.getByTestId('count');
const cards = (page: Page) => page.getByTestId('results').locator('.card');
const markers = (page: Page) => page.getByTestId('marker');
const chip = (page: Page, name: string) =>
  page.locator('#filter-body').getByRole('button', { name, exact: true });

/** 地圖標記數量要等於清單數量 */
async function expectMarkersMatchList(page: Page) {
  const n = await cards(page).count();
  await expect(markers(page)).toHaveCount(n);
}

test.beforeEach(async ({ page }) => setup(page));

test.describe('桌機', () => {
  test.skip(({ isMobile }) => isMobile, '桌機版面');

  test('/ 導向 /hsinchu-city', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hsinchu-city$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('竹市放電地圖');
    await expect(count(page)).toHaveText('72');
    await expect(page.getByTestId('origin-name')).toHaveText('新竹火車站（範例）');
  });

  test('沙坑＋廁所 → 1 處，另有 69 處資料未知；包含未知 → 70 處', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await chip(page, '沙坑').click();
    await chip(page, '廁所').click();
    await expect(count(page)).toHaveText('1');
    await expect(page.getByText('另有 69 處資料未知')).toBeVisible();
    await expectMarkersMatchList(page);

    await page.getByLabel('包含資料未知的場地').check();
    await expect(count(page)).toHaveText('70');
    await expect(page.getByText(/另有 \d+ 處資料未知/)).toHaveCount(0);
    await expectMarkersMatchList(page);
  });

  test('年齡未知的場地：選了年齡就不顯示，包含未知才顯示', async ({ page }) => {
    await page.goto('/hsinchu-city');
    const unknownAge = page.locator('.card[data-id="hsc-hccg-001"]');
    await expect(unknownAge).toContainText('年齡未知');

    await page.getByLabel('孩子年齡').selectOption('3');
    await expect(unknownAge).toHaveCount(0);
    await expectMarkersMatchList(page);

    await page.getByLabel('包含資料未知的場地').check();
    await expect(unknownAge).toHaveCount(1);
    await expectMarkersMatchList(page);
  });

  test('只看免費 → 10 處，另有 62 處資料未知（清冊場地的收費未知）', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await page.getByLabel('只看免費').check();
    await expect(count(page)).toHaveText('10');
    await expect(page.getByText('另有 62 處資料未知')).toBeVisible();
    await expect(page).toHaveURL(/\?free=1$/);
    await expectMarkersMatchList(page);
  });

  test('停車場＋付費 → 1 處（南寮兒童挖沙玩水區）', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await chip(page, '停車場').click();
    await page
      .getByRole('group', { name: '停車費用' })
      .getByRole('button', { name: '付費' })
      .click();
    await expect(count(page)).toHaveText('1');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('南寮兒童挖沙玩水區');
    await expect(cards(page).first()).toContainText('停車：停車場．付費');
    await expectMarkersMatchList(page);
  });

  test('地圖標記數量等於清單數量，編號一致，點清單會選取標記', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await expectMarkersMatchList(page);
    await page.getByRole('slider', { name: '距離上限（直線）' }).fill('3');
    await expect(count(page)).toHaveText('42');
    await expectMarkersMatchList(page);

    const first = cards(page).first();
    const name = (await first.locator('.cname').innerText()).replace(/^1\s*/, '');
    await expect(markers(page).filter({ hasText: /^1$/ })).toHaveAttribute('title', name);
    await first.click();
    await expect(first).toHaveClass(/sel/);
    await expect(page.locator('[data-testid="marker"].sel')).toHaveCount(1);
  });

  test('帶 query string 打開會還原篩選；改條件後網址更新，且不含出發點', async ({ page }) => {
    await page.goto('/hsinchu-city?play=sandpit&amen=toilet');
    await expect(count(page)).toHaveText('1');
    await expect(chip(page, '沙坑')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, '廁所')).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('包含資料未知的場地').check();
    await expect(page).toHaveURL(/\?play=sandpit&amen=toilet&unk=1$/);
    await page.reload();
    await expect(count(page)).toHaveText('70');
    await expect(page.getByLabel('包含資料未知的場地')).toBeChecked();

    await page.getByRole('button', { name: '清除篩選' }).click();
    await expect(page).toHaveURL(/\/hsinchu-city$/);
    await expect(count(page)).toHaveText('72');
  });

  test('出發點在新竹市與新竹縣交界：會載入新竹縣（未上線，空資料）且不出錯', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const hsq = page.waitForResponse((r) => r.url().endsWith('/api/cities/hsq/places'));

    await page.goto('/hsinchu-city');
    await page.getByLabel('地址或地標').fill('縣市交界');
    await page.getByRole('button', { name: '搜尋' }).click();
    await page.getByRole('button', { name: /縣市交界測試點/ }).click();
    await expect(page.getByTestId('origin-name')).toHaveText('縣市交界測試點');

    const res = await hsq;
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);

    await expect(count(page)).toHaveText('72');
    const ids = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
    expect(ids.every((id) => id?.startsWith('hsc-'))).toBe(true);
    await expect(page.getByText(/載入失敗/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('手機', () => {
  test.skip(({ isMobile }) => !isMobile, '手機版面');
  test.use({ viewport: { width: 400, height: 860 } });

  test('400px 寬沒有水平捲動（篩選面板打開時也一樣）', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await expect(count(page)).toHaveText('72');
    const noHScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noHScroll()).toBe(true);

    // 手機上篩選面板預設收起（由 CSS 決定，載入後不會跳動）
    const toggle = page.getByRole('button', { name: '篩選條件' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(chip(page, '沙坑')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(chip(page, '沙坑')).toBeVisible();
    expect(await noHScroll()).toBe(true);

    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('.side *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => el.className || el.tagName),
    );
    expect(overflowing).toEqual([]);
  });

  test('手機也能篩選，標記數量等於清單數量', async ({ page }) => {
    await page.goto('/hsinchu-city?play=sandpit');
    await expect(count(page)).toHaveText('8');
    await expectMarkersMatchList(page);
  });
});

// 場地頁與首頁詳情面板 e2e。地圖圖磚在測試中攔截；定位權限未授予，出發點是範例（新竹火車站）。
import { expect, test, type Page } from '@playwright/test';
import { expected, TOTAL } from './expected';

const LUGUANG = '/hsinchu-city/places/hsc-luguang-park';
const EXAMPLE_ORIGIN = '24.80163,120.97163';

test.beforeEach(async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org|nominatim/, (r) => r.abort());
});

const panel = (page: Page) => page.getByTestId('place-panel');
const card = (page: Page, id: string) => page.locator(`a.card[data-id="${id}"]`);
const routeHref = async (scope: ReturnType<Page['locator']> | Page) =>
  new URL(
    (await scope.getByRole('link', { name: '查實際路線（Google 地圖）' }).getAttribute('href')) ??
      '',
  );

/** 把詳情面板捲到底 */
async function scrolledToBottom(page: Page) {
  // 詳細資料載入後才有內容可以捲；每次重新捲到底，直到真的捲動了
  await expect(panel(page).getByRole('heading', { name: '基本資料' })).toBeVisible();
  await expect
    .poll(() =>
      panel(page).evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop;
      }),
    )
    .toBeGreaterThan(100);
}
/** 元素的 top、bottom，相對於面板頂端 */
const rel = (page: Page, sel: ReturnType<Page['locator']>) =>
  Promise.all([panel(page).boundingBox(), sel.boundingBox()]).then(([p, b]) => ({
    top: (b?.y ?? 0) - (p?.y ?? 0),
    bottom: (b?.y ?? 0) + (b?.height ?? 0) - (p?.y ?? 0),
  }));

test.describe('場地頁', () => {
  test.skip(({ isMobile }) => isMobile, '桌機');

  test('直接打開綠光公園：有溜索並標示來源與日期；SEO 標記齊全', async ({ page }) => {
    const res = await page.goto(LUGUANG);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle('綠光公園｜新竹市親子遊樂場');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('綠光公園');

    const zipline = page.locator('.arow', { hasText: '溜索' });
    await expect(zipline).toContainText('全市首座溜索');
    await expect(zipline.getByRole('link', { name: /蕃薯藤/ })).toHaveAttribute(
      'href',
      'https://travel.yam.com/article/119929',
    );
    await expect(zipline).toContainText('2026-10-10');

    await expect(page.getByText('座標與地圖資料 © OpenStreetMap contributors')).toBeVisible();
    await expect(page.getByText('OpenStreetMap w448662016（清冊編號 94）')).toBeVisible();

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /新竹市第一座有溜索的公園/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${LUGUANG}$`),
    );
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    );
    expect(ld).toMatchObject({ '@type': 'Playground', name: '綠光公園' });
    expect(ld.amenityFeature.map((a: { name: string }) => a.name)).toContain('溜索');
  });

  test('收費：手工整理的場地是免費；清冊場地是未知，JSON-LD 不寫 isAccessibleForFree', async ({
    page,
  }) => {
    await page.goto(LUGUANG);
    const fee = (p: Page) =>
      p
        .locator('.facts dt', { hasText: /^費用$/ })
        .first()
        .locator('+ dd');
    await expect(fee(page)).toHaveText('免費');

    await page.goto('/hsinchu-city/places/hsc-hccg-001');
    await expect(fee(page)).toHaveText('未知');
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    );
    expect(ld).not.toHaveProperty('isAccessibleForFree');
  });

  test('廁所來自公廁資料：青青草原標示來源與育嬰台', async ({ page }) => {
    await page.goto('/hsinchu-city/places/hsc-hccg-056');
    const amenity = page.getByRole('region', { name: '生活機能' });
    const toilet = amenity.locator('.arow', { hasText: '廁所' });
    await expect(toilet).toContainText('青青草原公廁(1)～青青草原公廁(6)（共 6 處）');
    await expect(toilet.getByRole('link', { name: /新竹市公廁地點資訊/ })).toHaveAttribute(
      'href',
      'https://data.gov.tw/dataset/67757',
    );
    await expect(amenity.locator('.arow', { hasText: '哺乳室' })).toContainText('公廁育嬰台 2 座');
  });

  test('還沒有資料的項目收成一行', async ({ page }) => {
    await page.goto(LUGUANG);
    const play = page.getByRole('region', { name: '遊樂設施' });
    await expect(play.locator('.unk')).toContainText('還沒有資料：嬰兒鞦韆');
    await expect(play.locator('.arow', { hasText: '嬰兒鞦韆' })).toHaveCount(0);
  });

  // P3：回報修正要先登入（登入後的流程在 auth.spec.ts）
  test('未登入按回報修正跳出登入視窗', async ({ page }) => {
    await page.goto(LUGUANG);
    await page.getByRole('button', { name: '回報修正' }).click();
    await expect(page.getByRole('dialog', { name: '登入' })).toBeVisible();
  });

  test('查實際路線：場地頁沒有出發點，只帶目的地', async ({ page }) => {
    await page.goto(LUGUANG);
    const url = await routeHref(page);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('origin')).toBeNull();
    expect(url.searchParams.get('destination')).toMatch(/^24\.\d+,120\.\d+$/);
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });

  test('不存在的場地、網址縣市不符、未上線縣市 → 404', async ({ page }) => {
    expect((await page.goto('/hsinchu-city/places/no-such-place'))?.status()).toBe(404);
    expect((await page.goto('/hsinchu-county/places/hsc-luguang-park'))?.status()).toBe(404);
    expect((await page.goto('/no-such-city'))?.status()).toBe(404);
  });

  test('sitemap 列出首頁與全部場地頁；robots 指向 sitemap', async ({ page }) => {
    const xml = await (await page.request.get('/sitemap.xml')).text();
    expect(xml.match(/<loc>/g)).toHaveLength(TOTAL + 1);
    expect(xml).toContain(`${LUGUANG}</loc>`);
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap:');
  });

  test('PWA：頁面連到 manifest、主畫面圖示與網址列顏色，圖示都拿得到', async ({ page }) => {
    await page.goto(LUGUANG);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      '放電地圖',
    );

    const res = await page.request.get(href!);
    expect(res.ok()).toBe(true);
    const m = (await res.json()) as { short_name: string; icons: { src: string }[] };
    expect(m.short_name).toBe('放電地圖');
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    for (const src of [...m.icons.map((i) => i.src), apple!]) {
      const icon = await page.request.get(src);
      expect(icon.ok(), src).toBe(true);
      expect(icon.headers()['content-type']).toBe('image/png');
    }
  });
});

test.describe('首頁的詳情面板', () => {
  test.skip(({ isMobile }) => isMobile, '桌機');

  test('點卡片打開面板、網址換成場地頁；上一頁回到原本的篩選；重新整理是場地頁', async ({
    page,
  }) => {
    await page.goto('/hsinchu-city?play=sandpit');
    await expect(page.getByTestId('count')).toHaveText(String(expected('沙坑').expected_count));
    await card(page, 'hsc-hsinchu-park').click();

    await expect(page).toHaveURL(/\/hsinchu-city\/places\/hsc-hsinchu-park$/);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('新竹公園');
    await expect(panel(page).getByRole('heading', { level: 2 })).toBeFocused();
    await expect(panel(page)).toContainText(/直線 .+，開車約 \d+ 分鐘（估算）/);

    await page.goBack();
    await expect(page).toHaveURL(/\/hsinchu-city\?play=sandpit$/);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByTestId('count')).toHaveText(String(expected('沙坑').expected_count));
    await expect(card(page, 'hsc-hsinchu-park')).toBeFocused();

    await page.goForward();
    await expect(panel(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('新竹公園');
    await expect(page.locator('.app')).toHaveCount(0);
  });

  test('卡片是連結，搜尋引擎與「開新分頁」都能用', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await expect(card(page, 'hsc-luguang-park')).toHaveAttribute('href', LUGUANG);
  });

  test('點地圖標記也會打開面板；Esc 關閉', async ({ page }) => {
    await page.goto('/hsinchu-city?play=zipline');
    const marker = page.getByTestId('marker').and(page.locator('[title="綠光公園"]'));
    await marker.click();
    await expect(panel(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${LUGUANG}$`));

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/hsinchu-city\?play=zipline$/);
  });

  test('查實際路線：面板帶入目前的出發點與交通方式', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await page
      .getByRole('group', { name: '交通方式' })
      .getByRole('button', { name: '步行' })
      .click();
    await card(page, 'hsc-luguang-park').click();
    const url = await routeHref(panel(page));
    expect(url.searchParams.get('origin')).toBe(EXAMPLE_ORIGIN);
    expect(url.searchParams.get('travelmode')).toBe('walking');
  });

  test('改篩選條件後場地不再符合時，面板關閉、網址換成新的篩選', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await card(page, 'hsc-hsinchu-park').click();
    await expect(panel(page)).toBeVisible();
    // 新竹公園沒有溜索的資料
    await page.locator('#filter-body').getByRole('button', { name: '溜索', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/hsinchu-city\?play=zipline$/);
  });

  test('捲動面板時，上方區塊（名稱、地址、按鈕）與關閉鈕固定在頂端', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await card(page, 'hsc-luguang-park').click();
    const p = panel(page);
    await expect(p.getByRole('heading', { name: '綠光公園' })).toBeVisible();
    await scrolledToBottom(page);
    const head = p.locator('.dhead');
    expect((await rel(page, head)).top).toBeLessThanOrEqual(1); // 貼在面板頂端
    const headBottom = (await rel(page, head)).bottom;
    for (const el of [
      p.getByRole('heading', { name: '綠光公園' }),
      p.locator('.dhead .cmeta'),
      p.getByRole('link', { name: '查實際路線（Google 地圖）' }),
      p.getByRole('button', { name: '回報修正' }),
      p.getByRole('button', { name: '關閉' }),
    ]) {
      const r = await rel(page, el);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.bottom).toBeLessThanOrEqual(headBottom + 1);
    }
    // 「基本資料」已經捲到上方區塊底下
    expect((await rel(page, p.getByRole('heading', { name: '基本資料' }))).top).toBeLessThan(
      headBottom,
    );
  });
});

test.describe('手機', () => {
  test.skip(({ isMobile }) => !isMobile, '手機');
  test.use({ viewport: { width: 400, height: 860 } });

  const noHScroll = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  test('底部抽屜打開時沒有水平捲動', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await card(page, 'hsc-luguang-park').click();
    await expect(panel(page)).toBeVisible();
    expect(await noHScroll(page)).toBe(true);
    const box = await panel(page).boundingBox();
    expect(box?.width).toBeLessThanOrEqual(400);
  });

  test('抽屜捲動時只固定名稱與按鈕，地址捲走', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await card(page, 'hsc-luguang-park').click();
    const p = panel(page);
    await expect(p.getByRole('heading', { name: '綠光公園' })).toBeVisible();
    await scrolledToBottom(page);
    const title = await rel(page, p.getByRole('heading', { name: '綠光公園' }));
    expect(title.top).toBeGreaterThanOrEqual(-1);
    expect(title.top).toBeLessThanOrEqual(1);
    const actions = await rel(page, p.locator('.dhead .actions'));
    expect(actions.top).toBeGreaterThanOrEqual(title.bottom - 1); // 按鈕貼在名稱下方
    expect(actions.top).toBeLessThanOrEqual(title.bottom + 1);
    await expect(p.getByRole('button', { name: '回報修正' })).toBeInViewport();
    // 地址已經捲走（在名稱與按鈕底下或面板外）
    expect((await rel(page, p.locator('.dhead .cmeta'))).bottom).toBeLessThanOrEqual(
      actions.bottom,
    );
    expect((await rel(page, p.locator('.dhead .cmeta'))).top).toBeLessThan(title.bottom);
  });

  test('場地頁沒有水平捲動', async ({ page }) => {
    await page.goto(LUGUANG);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('綠光公園');
    expect(await noHScroll(page)).toBe(true);
  });
});

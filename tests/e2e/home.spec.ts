// 首頁 e2e。地圖圖磚與 Nominatim 在測試中攔截，不連外網；定位權限未授予，出發點維持範例（新竹火車站）。
// 前提：本機 Supabase 已 db reset + seed，並執行過 pnpm env:local。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expected, TOTAL } from './expected';

/** 新竹市與新竹縣交界附近（竹北市與新竹市東區之間）。只用在攔截的 Nominatim 回應。 */
const BORDER = { lat: 24.8215, lng: 121.0105 };

async function setup(page: Page) {
  await page.route(/tiles\.openfreemap\.org|tile\.openstreetmap\.org/, (r) => r.abort());
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

/**
 * 按下切換按鈕，等到 aria-pressed 變成 true。
 * 頁面剛載入、React 還沒 hydrate 時點下去不會有反應（CI 偶爾發生），所以沒按下就再點一次；
 * 已經按下就不再點，不會點兩次又切回去。
 */
async function press(button: Locator) {
  await expect(async () => {
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass();
}

/** 地圖標記數量要等於清單數量 */
async function expectMarkersMatchList(page: Page) {
  const n = await cards(page).count();
  await expect(markers(page)).toHaveCount(n);
}

/** 縣市頁左側的標題區（載入中的骨架也有 header.head，用出發點區分） */
const head = (page: Page) => page.locator('header.head', { has: page.getByTestId('origin-name') });

/** 標題區的插圖不壓到下一行（縣市選單那一行），標題區也沒有被裁切 */
async function expectHeadNotClipped(page: Page) {
  await page.goto('/hsinchu-city');
  await expect(count(page)).toHaveText(String(TOTAL));
  // 版面還沒算好時量到的都是 0：重試到插圖真的有位置為止
  await expect(async () => {
    const m = await head(page).evaluate((h) => ({
      artBottom: h.querySelector('.pa-mini')!.getBoundingClientRect().bottom,
      subTop: h.querySelector('.sub')!.getBoundingClientRect().top,
      clipped: h.scrollHeight - h.clientHeight,
    }));
    expect(m.artBottom).toBeGreaterThan(0);
    expect(m.artBottom).toBeLessThanOrEqual(m.subTop);
    expect(m.clipped).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5000 });
  // 標題區最下面的按鈕看得到、按得到（沒被裁掉）
  const btn = head(page).getByRole('button', { name: '使用目前位置' });
  await btn.scrollIntoViewIfNeeded();
  const box = (await btn.boundingBox())!;
  const hb = (await head(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(hb.y + hb.height);
}

test.beforeEach(async ({ page }) => setup(page));

test('「回報新場地」跟出發點方式在同一排，整排跟交通方式對齊', async ({ page }) => {
  await page.goto('/hsinchu-city');
  const seg = (await head(page).getByRole('group', { name: '出發點方式' }).boundingBox())!;
  const report = (await head(page).getByRole('button', { name: '回報新場地' }).boundingBox())!;
  const modes = (await head(page).getByRole('group', { name: '交通方式' }).boundingBox())!;
  expect(Math.abs(report.y + report.height / 2 - (seg.y + seg.height / 2))).toBeLessThan(2);
  expect(Math.abs(seg.x - modes.x)).toBeLessThan(2);
  expect(Math.abs(report.x + report.width - (modes.x + modes.width))).toBeLessThan(2);
});

test('出發點方式二選一：地圖點選時選「在地圖上點選」，地址搜尋時兩個都不選', async ({
  page,
  isMobile,
}) => {
  // 只在桌機跑：手機版（觸控模擬）在全部測試同時跑時偶爾卡住、單獨重跑又重現不出來；
  // 按鈕狀態桌機手機共用同一個元件，手機版另有「定位成功」的測試
  test.skip(isMobile, '手機版不穩定，只在桌機測');
  await page.goto('/hsinchu-city');
  const here = head(page).getByRole('button', { name: '使用目前位置' });
  const pick = head(page).getByRole('button', { name: '在地圖上點選' });
  // 沒有授予定位權限：還是範例出發點，兩個都不選
  await expect(here).toHaveAttribute('aria-pressed', 'false');
  await expect(pick).toHaveAttribute('aria-pressed', 'false');

  await press(pick);
  await expect(here).toHaveAttribute('aria-pressed', 'false');
  const map = page.getByRole('region', { name: '地圖' });
  await expect(page.getByText('地圖載入中…')).toHaveCount(0, { timeout: 15_000 });
  const box = (await map.boundingBox())!;
  // 找一個點下去真的是地圖本身的位置：地圖剛載入時還在移動，標記會移過來；
  // 點到標記會打開場地詳情，所以每次點之前都重新確認
  await expect(async () => {
    let tapped = false;
    for (const [dx, dy] of [
      [40, -40],
      [-40, 40],
      [80, 80],
      [-80, -80],
      [120, 0],
      [0, -120],
    ] as const) {
      const x = box.x + box.width / 2 + dx;
      const y = box.y + box.height / 2 + dy;
      const onMap = await page.evaluate(
        ([px, py]) => !!document.elementFromPoint(px!, py!)?.matches('canvas.maplibregl-canvas'),
        [x, y],
      );
      if (!onMap) continue;
      await page.mouse.click(x, y);
      tapped = true;
      break;
    }
    expect(tapped).toBe(true);
    await expect(page.getByTestId('origin-name')).toHaveText(/^地圖上的點/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(here).toHaveAttribute('aria-pressed', 'false');

  await page.getByLabel('地址或地標').fill('縣市交界');
  await page.getByRole('button', { name: '搜尋' }).click();
  await page.getByRole('button', { name: /縣市交界測試點/ }).click();
  await expect(page.getByTestId('origin-name')).toHaveText('縣市交界測試點');
  await expect(here).toHaveAttribute('aria-pressed', 'false');
  await expect(pick).toHaveAttribute('aria-pressed', 'false');
});

test('出發點方式：定位成功時選「使用目前位置」', async ({ browser }) => {
  const ctx = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 24.8036, longitude: 120.9686 },
  });
  const page = await ctx.newPage();
  await setup(page);
  await page.goto('/hsinchu-city');
  await expect(page.getByTestId('origin-name')).toHaveText('目前位置');
  await expect(head(page).getByRole('button', { name: '使用目前位置' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(head(page).getByRole('button', { name: '在地圖上點選' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await ctx.close();
});

test('OpenFreeMap 失敗時改用 OSM 官方圖磚；版權標示連到 osm.org/copyright', async ({ browser }) => {
  // 用新的 context，不套用上面攔截全部圖磚的設定
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // 1×1 透明 PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  await page.route(/tiles\.openfreemap\.org/, (r) => r.abort());
  await page.route(/basemaps\.cartocdn\.com/, (r) => r.abort());
  const osmTile = page.waitForRequest(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  await page.route(/tile\.openstreetmap\.org/, (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );

  await page.goto('/hsinchu-city');
  await osmTile;
  const credit = page.locator(
    '.maplibregl-ctrl-attrib a[href="https://www.openstreetmap.org/copyright"]',
  );
  await expect(credit).toHaveText('© OpenStreetMap contributors');
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toContainText(/CARTO/i);
  await ctx.close();
});

test.describe('桌機', () => {
  test.skip(({ isMobile }) => isMobile, '桌機版面');

  test('標題區：插圖不壓到副標題那一行', async ({ page }) => {
    await expectHeadNotClipped(page);
  });

  test('/ 導向 /hsinchu-city', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hsinchu-city$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('全台放電地圖');
    await expect(count(page)).toHaveText(String(TOTAL));
    await expect(page.getByTestId('origin-name')).toHaveText('新竹火車站（範例）');
  });

  test('沙坑＋廁所：顯示「另有 N 處資料未知」；包含未知後筆數照標準答案', async ({ page }) => {
    const strict = expected('沙坑＋廁所');
    const loose = expected('沙坑＋廁所（包含未知）');
    await page.goto('/hsinchu-city');
    await press(chip(page, '沙坑'));
    await press(chip(page, '廁所'));
    await expect(count(page)).toHaveText(String(strict.expected_count));
    await expect(page.getByText(`另有 ${strict.unknown_hint} 處資料未知`)).toBeVisible();
    await expectMarkersMatchList(page);

    await page.getByLabel('包含資料未知的場地').check();
    await expect(count(page)).toHaveText(String(loose.expected_count));
    await expect(page.getByText(/另有 \d+ 處資料未知/)).toHaveCount(0);
    await expectMarkersMatchList(page);
  });

  test('沒有年齡與規模篩選（decisions D25）：年齡未知的場地照常顯示；舊連結的 age、size 參數忽略', async ({
    page,
  }) => {
    await page.goto('/hsinchu-city');
    await expect(page.getByLabel('孩子年齡')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '場地規模' })).toHaveCount(0);
    const unknownAge = page.locator('.card[data-id="hsc-hccg-001"]');
    await expect(unknownAge).toContainText('年齡未知');

    await page.goto('/hsinchu-city?age=3&size=S&play=sandpit');
    await expect(count(page)).toHaveText(String(expected('沙坑').expected_count));
    await page.getByLabel('包含資料未知的場地').check();
    await expect(page).toHaveURL(/\?play=sandpit&unk=1$/);
    await expectMarkersMatchList(page);
  });

  test('遊樂設施類別＝其中任一種（decisions D26）：筆數照標準答案；同一類的類別與單項互相取代', async ({
    page,
  }) => {
    const any = expected('攀爬平衡（任一種）');
    await page.goto('/hsinchu-city');
    await press(chip(page, '攀爬架'));
    const climbingOnly = Number(await count(page).innerText());

    await press(chip(page, '攀爬平衡'));
    await expect(chip(page, '攀爬平衡')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, '攀爬架')).toHaveAttribute('aria-pressed', 'false');
    await expect(count(page)).toHaveText(String(any.expected_count));
    expect(any.expected_count).toBeGreaterThanOrEqual(climbingOnly);
    await expect(page.getByText(`另有 ${any.unknown_hint} 處資料未知`)).toBeVisible();
    await expect(page).toHaveURL(/\?grp=climb$/);
    await expectMarkersMatchList(page);

    await press(chip(page, '攀岩牆'));
    await expect(chip(page, '攀爬平衡')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, '攀岩牆')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\?play=climbing_wall$/);

    await page.goto('/hsinchu-city?grp=climb&amen=toilet');
    await expect(count(page)).toHaveText(String(expected('攀爬平衡＋廁所').expected_count));
    await expect(chip(page, '攀爬平衡')).toHaveAttribute('aria-pressed', 'true');
  });

  test('只看免費：清冊場地的收費未知，算在「另有 N 處資料未知」', async ({ page }) => {
    const free = expected('只看免費');
    await page.goto('/hsinchu-city');
    await page.getByLabel('只看免費').check();
    await expect(count(page)).toHaveText(String(free.expected_count));
    await expect(page.getByText(`另有 ${free.unknown_hint} 處資料未知`)).toBeVisible();
    await expect(page).toHaveURL(/\?free=1$/);
    await expectMarkersMatchList(page);
  });

  test('停車場＋付費：南寮兒童挖沙玩水區', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await press(chip(page, '停車場'));
    await press(
      page.getByRole('group', { name: '停車費用' }).getByRole('button', { name: '付費' }),
    );
    await expect(count(page)).toHaveText(String(expected('停車場＋付費').expected_count));
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('南寮兒童挖沙玩水區');
    await expect(cards(page).first()).toContainText('停車：停車場．付費');
    await expectMarkersMatchList(page);
  });

  test('地圖標記數量等於清單數量，編號一致，點清單會選取標記', async ({ page }) => {
    await page.goto('/hsinchu-city');
    await expectMarkersMatchList(page);
    await page.getByRole('slider', { name: '距離上限（直線）' }).fill('3');
    await expect(count(page)).toHaveText(String(expected('3 公里內').expected_count));
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
    await expect(count(page)).toHaveText(String(expected('沙坑＋廁所').expected_count));
    await expect(chip(page, '沙坑')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, '廁所')).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel('包含資料未知的場地').check();
    await expect(page).toHaveURL(/\?play=sandpit&amen=toilet&unk=1$/);
    await page.reload();
    await expect(count(page)).toHaveText(String(expected('沙坑＋廁所（包含未知）').expected_count));
    await expect(page.getByLabel('包含資料未知的場地')).toBeChecked();

    await page.getByRole('button', { name: '清除篩選' }).click();
    await expect(page).toHaveURL(/\/hsinchu-city$/);
    await expect(count(page)).toHaveText(String(TOTAL));
  });

  test('出發點在新竹市與新竹縣交界：距離不限時只看新竹市，設了距離才載入新竹縣（未上線，空資料）且不出錯', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const hsqRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/api/cities/hsq/places')) hsqRequests.push(r.url());
    });

    await page.goto('/hsinchu-city');
    await page.getByLabel('地址或地標').fill('縣市交界');
    await page.getByRole('button', { name: '搜尋' }).click();
    await page.getByRole('button', { name: /縣市交界測試點/ }).click();
    await expect(page.getByTestId('origin-name')).toHaveText('縣市交界測試點');

    // 距離不限：只顯示新竹市，不去抓新竹縣
    await expect(count(page)).toHaveText(String(TOTAL));
    await page.waitForTimeout(500);
    expect(hsqRequests).toEqual([]);

    // 設了距離上限：附近的新竹縣也算進來
    const hsq = page.waitForResponse((r) => r.url().endsWith('/api/cities/hsq/places'));
    await page.getByRole('slider', { name: '距離上限（直線）' }).fill('20');
    const res = await hsq;
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);

    const ids = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
    expect(ids.length).toBeGreaterThan(0);
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
    await expect(count(page)).toHaveText(String(TOTAL));
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

  test('標題區沒有被壓扁：標題、出發點、交通方式都看得到', async ({ page }) => {
    await expectHeadNotClipped(page);
  });

  test('選取選項（變粗體、加勾）時按鈕寬度不變，不會掉到下一行', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 860 });
    await page.goto('/hsinchu-city');
    const baby = chip(page, '嬰兒鞦韆');
    // 伺服器端當成桌機（aria-expanded 是 true），hydrate 後才變成手機的收起，
    // 所以用選項有沒有出現判斷，還沒出現就再點一次（hydrate 前點的不算）
    await expect(async () => {
      if (!(await baby.isVisible())) await page.getByRole('button', { name: '篩選條件' }).click();
      await expect(baby).toBeVisible({ timeout: 1000 });
    }).toPass();
    // 點擊會把面板捲動到按鈕的位置，所以量相對於同一組選項的位置
    const box = () =>
      baby.evaluate((c) => {
        const r = c.getBoundingClientRect();
        return { width: r.width, y: r.y - c.parentElement!.getBoundingClientRect().y };
      });
    await baby.scrollIntoViewIfNeeded();
    const before = await box();
    await press(baby);
    const after = await box();
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.y).toBeCloseTo(before.y, 0);

    // 有類別顏色的每個選項（遊樂設施、生活機能）：選取樣式套上前後一樣寬、一樣高
    const changed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#filter-body [data-tone] .chip')]
        .filter((c) => {
          const was = c.getAttribute('aria-pressed');
          c.setAttribute('aria-pressed', 'false');
          const a = c.getBoundingClientRect();
          c.setAttribute('aria-pressed', 'true');
          const b = c.getBoundingClientRect();
          c.setAttribute('aria-pressed', was ?? 'false');
          return Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5;
        })
        .map((c) => c.textContent),
    );
    expect(changed).toEqual([]);
  });

  test('手機也能篩選，標記數量等於清單數量', async ({ page }) => {
    await page.goto('/hsinchu-city?play=sandpit');
    await expect(count(page)).toHaveText(String(expected('沙坑').expected_count));
    await expectMarkersMatchList(page);
  });
});

// Next.js 換頁時把上一頁藏起來（React <Activity>）；按「上一頁」回來時地圖會重建，標記要跟著重建
test('到登入頁再按上一頁回來，地圖上的標記還在', async ({ page }) => {
  await page.goto('/hsinchu-city');
  await expect(markers(page)).toHaveCount(TOTAL);
  await page.getByRole('link', { name: '登入', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/hsinchu-city$/);
  await expect(markers(page)).toHaveCount(TOTAL);
});

// 主要圖磚（灰階）已經載入過，按「上一頁」回來重建地圖時，即使請求失敗或被中斷也不改用備援（OSM，彩色）
test('到登入頁再按上一頁回來，地圖不會換成備援圖磚', async ({ page }) => {
  // 用本機的簡單樣式代替 OpenFreeMap（不連外網）；備援圖磚只計數
  let fallback = 0;
  await page.route(/tile\.openstreetmap\.org/, (r) => {
    fallback++;
    return r.abort();
  });
  await page.route(/tiles\.openfreemap\.org/, (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }],
      },
    }),
  );
  await page.goto('/hsinchu-city');
  await expect(markers(page)).toHaveCount(TOTAL);
  await expect(page.getByText('地圖載入中…')).toHaveCount(0);
  await page.getByRole('link', { name: '登入', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  // 回來時主要圖磚的請求失敗（模擬被中斷或網路不穩）
  await page.route(/tiles\.openfreemap\.org/, (r) => r.abort());
  await page.goBack();
  await expect(markers(page)).toHaveCount(TOTAL);
  await page.waitForTimeout(1500);
  expect(fallback).toBe(0);
});

test('主要圖磚第一次就載入失敗時，改用備援圖磚', async ({ page }) => {
  let fallback = 0;
  await page.route(/tile\.openstreetmap\.org/, (r) => {
    fallback++;
    return r.abort();
  });
  await page.route(/tiles\.openfreemap\.org/, (r) => r.abort());
  await page.goto('/hsinchu-city');
  await expect(markers(page)).toHaveCount(TOTAL);
  await expect.poll(() => fallback).toBeGreaterThan(0);
});

test('地圖預設彩色（liberty），可以切換成灰階（positron），重新整理後仍記得', async ({ page }) => {
  // 用本機的簡單樣式代替 OpenFreeMap（不連外網），記下請求了哪個樣式
  const styles: string[] = [];
  await page.route(/tiles\.openfreemap\.org\/styles\//, (r) => {
    styles.push(r.request().url());
    return r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eeeeee' } }],
      },
    });
  });
  const toggle = page.getByTestId('map-color');
  await page.goto('/hsinchu-city');
  await expect(toggle).toHaveText('灰階');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => styles.at(-1)).toMatch(/\/styles\/liberty$/);

  await toggle.click();
  await expect(toggle).toHaveText('彩色');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName('地圖改成彩色');
  await expect.poll(() => styles.at(-1)).toMatch(/\/styles\/positron$/);
  await expect(markers(page)).toHaveCount(TOTAL); // 標記不受影響

  styles.length = 0;
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => styles.at(-1)).toMatch(/\/styles\/positron$/);
  expect(styles.some((u) => u.endsWith('/liberty'))).toBe(false);
});

test('備援圖磚（OSM，彩色）在灰階時用濾鏡轉灰', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pm.map', JSON.stringify({ color: 'gray' })));
  await page.goto('/hsinchu-city');
  const map = page.getByTestId('map');
  await expect(map).toHaveClass(/map-gray-raster/); // setup() 攔截了 OpenFreeMap，改用備援
  await expect(map.locator('canvas.maplibregl-canvas')).toHaveCSS('filter', 'grayscale(1)');
  await page.getByTestId('map-color').click();
  await expect(map).not.toHaveClass(/map-gray-raster/);
});

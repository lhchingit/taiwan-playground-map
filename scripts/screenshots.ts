// 原型與正式版並排截圖（PR 附圖用）：pnpm screenshots <p1b|p1c>
//   p1b：首頁篩選；p1c：場地詳情（原型詳情面板 vs 正式版面板）與場地頁。輸出到 docs/screenshots/<組別>/
// 前提：正式版在 http://localhost:3100 執行中（pnpm build && pnpm start --port 3100）。
// 兩邊都用範例出發點（新竹火車站）、不授予定位權限，並使用真實的地圖圖磚。
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const SET = process.argv[2] ?? 'p1b';
const OUT = resolve(`docs/screenshots/${SET}`);
const APP = process.env.APP_URL ?? 'http://localhost:3100/hsinchu-city';
const PROTO = pathToFileURL(resolve('docs/prototype/playmap.html')).href;

interface Scenario {
  name: string;
  /** 正式版的 query string */
  query: string;
  /** 在原型上做同樣的操作 */
  proto: (page: Page) => Promise<void>;
  /** 正式版載入後的操作 */
  app?: (page: Page) => Promise<void>;
}

const chip = (page: Page, text: string) =>
  page
    .locator('.chip', { hasText: new RegExp(`^${text}$`) })
    .first()
    .click();

const FILTERS: Scenario[] = [
  { name: '01-無條件', query: '', proto: async () => {} },
  {
    name: '02-沙坑+廁所',
    query: 'play=sandpit&amen=toilet',
    proto: async (p) => {
      await chip(p, '沙坑');
      await chip(p, '廁所');
    },
  },
  {
    name: '03-沙坑+廁所-包含未知',
    query: 'play=sandpit&amen=toilet&unk=1',
    proto: async (p) => {
      await chip(p, '沙坑');
      await chip(p, '廁所');
      await p.locator('#incUnknown').check();
    },
  },
  {
    name: '04-停車場+付費',
    query: 'pk=lot&pkfee=paid',
    proto: async (p) => {
      await chip(p, '停車場');
      await p.locator('#pkFeeSeg button[data-fee="paid"]').click();
    },
  },
];

const openCard = (id: string) => async (p: Page) => {
  await p.locator(`.card[data-id="${id}"]`).click();
};

const DETAILS: Scenario[] = [
  {
    name: '05-綠光公園詳情',
    query: '',
    proto: openCard('hsc-luguang-park'),
    app: openCard('hsc-luguang-park'),
  },
  {
    name: '06-沙坑-新竹公園詳情',
    query: 'play=sandpit',
    proto: async (p) => {
      await chip(p, '沙坑');
      await openCard('hsc-hsinchu-park')(p);
    },
    app: openCard('hsc-hsinchu-park'),
  },
];

const SCENARIOS = SET === 'p1c' ? DETAILS : FILTERS;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 400, height: 860 },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'zh-TW',
    });
    for (const s of SCENARIOS) {
      const proto = await ctx.newPage();
      await proto.goto(PROTO);
      await proto.waitForTimeout(1500);
      // 原型在手機寬度會收起篩選面板
      await proto
        .locator('details.filters')
        .evaluate((d) => ((d as HTMLDetailsElement).open = true));
      await s.proto(proto);
      if (vp.name === 'mobile') {
        await proto
          .locator('details.filters')
          .evaluate((d) => ((d as HTMLDetailsElement).open = false));
      }
      await proto.waitForTimeout(2500);
      await proto.screenshot({
        path: `${OUT}/${vp.name}-${s.name}-原型.jpg`,
        type: 'jpeg',
        quality: 70,
      });
      const protoCount = await proto.locator('#count').innerText();
      await proto.close();

      const app = await ctx.newPage();
      await app.goto(s.query ? `${APP}?${s.query}` : APP);
      await app.waitForTimeout(3000);
      if (s.app) {
        await s.app(app);
        await app.waitForTimeout(1500);
      }
      await app.screenshot({
        path: `${OUT}/${vp.name}-${s.name}-正式版.jpg`,
        type: 'jpeg',
        quality: 70,
      });
      const appCount = await app.getByTestId('count').innerText();
      await app.close();

      console.log(`${vp.name} ${s.name}：原型 ${protoCount} 處、正式版 ${appCount} 處`);
    }
    if (SET === 'p1c') {
      // 場地頁（原型沒有獨立頁）
      const page = await ctx.newPage();
      await page.goto(`${APP}/places/hsc-luguang-park`);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `${OUT}/${vp.name}-07-場地頁-正式版.jpg`,
        type: 'jpeg',
        quality: 70,
        fullPage: true,
      });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

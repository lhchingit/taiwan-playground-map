// 產生 PWA 與主畫面圖示（decisions D1）：pnpm icons
// 把 src/app/icon.svg 的圖釘畫在淺底（--paper）正方形上，輸出 PNG。圖示改了就重跑，產生的檔案要提交。
//   public/icons/icon-192.png、icon-512.png：manifest 的一般圖示
//   public/icons/icon-maskable-512.png：Android 會裁成圓形等形狀，圖釘縮小放在安全範圍內
//   src/app/apple-icon.png：iOS「加入主畫面」（Next 自動加上 apple-touch-icon）
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PAPER = '#f5f7f2';
const svg = readFileSync('src/app/icon.svg', 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** 圖釘佔邊長的比例：一般圖示 0.8；maskable 的安全範圍是中間直徑 80% 的圓，用 0.6 */
function iconSvg(scale: number): string {
  const size = 32 * scale;
  const offset = (32 - size) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${PAPER}"/>` +
    `<svg x="${offset}" y="${offset}" width="${size}" height="${size}" viewBox="0 0 32 32">${inner}</svg>` +
    `</svg>`
  );
}

const OUTPUTS = [
  { path: 'public/icons/icon-192.png', px: 192, scale: 0.8 },
  { path: 'public/icons/icon-512.png', px: 512, scale: 0.8 },
  { path: 'public/icons/icon-maskable-512.png', px: 512, scale: 0.6 },
  { path: 'src/app/apple-icon.png', px: 180, scale: 0.8 },
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
for (const { path, px, scale } of OUTPUTS) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  await page.setContent(
    `<html><body style="margin:0">` +
      iconSvg(scale).replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `) +
      `</body></html>`,
  );
  await page.screenshot({ path, clip: { x: 0, y: 0, width: px, height: px } });
  await page.close();
  console.log(`${path}（${px}×${px}）`);
}
await browser.close();

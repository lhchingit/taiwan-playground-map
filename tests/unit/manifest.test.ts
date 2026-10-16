import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

/** PNG 的寬高（IHDR 區塊，檔頭第 16～23 byte） */
function pngSize(path: string): string {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe('PWA manifest（decisions D1）', () => {
  const m = manifest();

  it('名稱、顏色、從首頁開啟', () => {
    expect(m.name).toBe('全台放電地圖');
    expect(m.short_name).toBe('放電地圖');
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    // 跟 globals.css 的淺色 --paper、--teal 一致
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain(`--paper: ${m.background_color};`);
    expect(css).toContain(`--teal: ${m.theme_color};`);
  });

  it('有 192、512 與 maskable 圖示（Android 安裝的條件）', () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it.each((manifest().icons ?? []).map((i) => [i.src, i.sizes]))(
    '%s 存在且尺寸是 %s',
    (src, sizes) => {
      expect(pngSize(`public${src}`)).toBe(sizes);
    },
  );

  it('iOS 主畫面圖示是 180×180', () => {
    expect(pngSize('src/app/apple-icon.png')).toBe('180x180');
  });
});

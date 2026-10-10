import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SeedFile } from '@/types/place';
import { validateSeed } from '../../scripts/seed/validate';

const real = JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as SeedFile;

/** 複製真實資料後改動其中一處，確認檢查會抓到 */
function mutated(change: (s: SeedFile) => void): SeedFile {
  const copy = structuredClone(real);
  change(copy);
  return copy;
}

const first = (s: SeedFile) => s.places[0]!;

describe('validateSeed', () => {
  it('目前的 places.json 通過檢查', () => {
    expect(validateSeed(real)).toEqual([]);
  });

  it('y / n 沒有來源 → 錯誤', () => {
    const s = mutated((s) => (first(s).attrs.slide = { v: 'y', src: null, note: null, at: null }));
    expect(validateSeed(s).join()).toContain('slide：缺少來源');
  });

  it('n 也需要來源與日期', () => {
    const s = mutated(
      (s) => (first(s).attrs.zipline = { v: 'n', src: 'yam', note: null, at: null }),
    );
    expect(validateSeed(s).join()).toContain('zipline：缺少確認日期');
  });

  it('來源不存在 → 錯誤', () => {
    const s = mutated((s) => (first(s).attrs.slide!.src = 'google'));
    expect(validateSeed(s).join()).toContain('來源不存在');
  });

  it('不接受 y / n / u 以外的值（例如布林值）', () => {
    const s = mutated((s) => ((first(s).attrs.slide as unknown as { v: unknown }).v = true));
    expect(validateSeed(s).join()).toContain('值必須是 y / n / u');
  });

  it('未定義的屬性 → 錯誤', () => {
    const s = mutated(
      (s) => (first(s).attrs.jetpack = { v: 'u', src: null, note: null, at: null }),
    );
    expect(validateSeed(s).join()).toContain('jetpack：未定義的屬性');
  });

  it('city 必須是縣市代碼，不是中文名稱', () => {
    const s = mutated((s) => (first(s).city = '新竹市'));
    expect(validateSeed(s).join()).toContain('三碼縣市代碼');
  });

  it('測試資料（test-）不可進入 seed', () => {
    const s = mutated((s) => s.places.push({ ...first(s), id: 'test-hsc-x' }));
    expect(validateSeed(s).join()).toContain('測試資料不可進入 seed');
  });

  it('座標來自 Google → 錯誤', () => {
    const s = mutated((s) => (first(s).source_coords = 'Google Places'));
    expect(validateSeed(s).join()).toContain('座標來自 Google');
  });

  it('經緯度寫反 → 錯誤', () => {
    const s = mutated((s) => {
      const p = first(s);
      [p.lat, p.lng] = [p.lng, p.lat];
    });
    expect(validateSeed(s).join()).toContain('座標不在台灣範圍內');
  });

  it('已知的停車資料需要來源', () => {
    const s = mutated(
      (s) =>
        (first(s).parking = {
          type: 'lot',
          fee: 'u',
          spaces: null,
          src: null,
          note: null,
          at: null,
        }),
    );
    expect(validateSeed(s).join()).toContain('parking：缺少來源');
  });

  it('id 重複 → 錯誤', () => {
    const s = mutated((s) => s.places.push(structuredClone(first(s))));
    expect(validateSeed(s).join()).toContain('id 重複');
  });
});

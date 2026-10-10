// 讀 data/raw/osm-city-bounds.json（scripts/fetch_city_bounds.py 產生）
import { readFileSync } from 'node:fs';
import type { Bbox } from './bbox';

const PATH = 'data/raw/osm-city-bounds.json';

export function parseOsmBounds(data: unknown): Record<string, Bbox> {
  const cities = (data as { cities?: Record<string, { bbox?: unknown }> }).cities ?? {};
  const out: Record<string, Bbox> = {};
  for (const [code, c] of Object.entries(cities)) {
    const b = c.bbox;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number')) {
      throw new Error(`${PATH}：${code} 的 bbox 不是 4 個數字`);
    }
    const [w, s, e, n] = b as Bbox;
    if (!(w < e && s < n)) throw new Error(`${PATH}：${code} 的 bbox 不是 [西, 南, 東, 北]`);
    out[code] = [w, s, e, n];
  }
  return out;
}

export function loadOsmBounds(): Record<string, Bbox> {
  return parseOsmBounds(JSON.parse(readFileSync(PATH, 'utf8')));
}

/**
 * 只保留沒有種子資料的縣市：有場地的縣市用「場地座標外擴 1 公里」，
 * 不可以在匯入其他縣市時被 OSM 行政界蓋掉。
 */
export function boundsWithoutSeeds(
  osm: Readonly<Record<string, Bbox>>,
  seedCities: readonly string[],
): Record<string, Bbox> {
  return Object.fromEntries(Object.entries(osm).filter(([code]) => !seedCities.includes(code)));
}

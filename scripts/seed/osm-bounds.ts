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

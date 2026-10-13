// 跨縣市的距離篩選（P4、P5 完成標準）：用各縣市的種子資料，從交界附近出發
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterPlaces, type FilterPlace, type Filters } from '@/lib/filter';
import type { Place, SeedFile, Tri } from '@/types/place';

function load(city: string): FilterPlace[] {
  const seed = JSON.parse(readFileSync(`data/seed/${city}/places.json`, 'utf8')) as SeedFile;
  return seed.places.map((p: Place) => {
    const attrs: Record<string, Tri> = {};
    for (const [k, a] of Object.entries(p.attrs)) attrs[k] = a.v;
    return { ...p, attrs };
  });
}

const places = [
  ...load('hsc'),
  ...load('hsq'),
  ...load('tyc'),
  ...load('mlc'),
  ...load('tpe'),
  ...load('nwt'),
];
// 新竹市東區與竹北市交界附近（新竹市的東區、北區與竹北市的場地都在 10 公里內）
const ORIGIN = { lat: 24.815, lng: 121.0 };
const run = (f: Partial<Filters>) => filterPlaces(places, { ...DEFAULT_FILTERS, ...f }, ORIGIN);
const cityOf = (id: string) => id.slice(0, 3);

describe('跨縣市距離篩選（新竹市＋新竹縣）', () => {
  it('10 公里內：兩個縣市的場地都在，依距離由近到遠', () => {
    const { results } = run({ maxKm: 10 });
    expect(new Set(results.map((p) => cityOf(p.id)))).toEqual(new Set(['hsc', 'hsq']));
    expect(results.every((p) => p.km <= 10)).toBe(true);
    const km = results.map((p) => p.km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
  });

  it('距離外的不出現；新竹縣較遠的場地（例如關西、新埔）不在 10 公里內', () => {
    const near = new Set(run({ maxKm: 10 }).results.map((p) => p.id));
    const all = run({}).results;
    expect(all.length).toBe(places.length);
    expect(all.some((p) => cityOf(p.id) === 'hsq' && !near.has(p.id))).toBe(true);
  });

  it('有設施條件時：新竹縣的場地都是未知，預設不通過，開啟「包含資料未知」才出現', () => {
    const strict = run({ maxKm: 10, play: ['slide'] });
    expect(strict.results.some((p) => cityOf(p.id) === 'hsq')).toBe(false);
    expect(strict.unknownHint).toBeGreaterThan(0);
    const loose = run({ maxKm: 10, play: ['slide'], includeUnknown: true });
    expect(loose.results.some((p) => cityOf(p.id) === 'hsq')).toBe(true);
    // 「無」永遠不通過：新竹縣沒有任何 n，所以開啟後只會多、不會少
    expect(loose.results.length).toBeGreaterThanOrEqual(strict.results.length);
  });
});

describe('跨縣市距離篩選（桃園市）', () => {
  // 桃園市楊梅區與新竹縣湖口鄉交界附近
  const BORDER = { lat: 24.88, lng: 121.12 };
  it('20 公里內同時有新竹縣與桃園市的場地；遠在桃園市區的不在範圍內', () => {
    const { results } = filterPlaces(places, { ...DEFAULT_FILTERS, maxKm: 20 }, BORDER);
    const cities = new Set(results.map((p) => cityOf(p.id)));
    expect(cities.has('tyc')).toBe(true);
    expect(cities.has('hsq')).toBe(true);
    const all = filterPlaces(places, DEFAULT_FILTERS, BORDER).results;
    expect(all.some((p) => cityOf(p.id) === 'tyc' && p.km > 20)).toBe(true);
  });

  it('桃園市的遊具來自公園資料：有沙坑條件時，桃園市有沙坑的場地直接通過', () => {
    const { results } = filterPlaces(places, { ...DEFAULT_FILTERS, play: ['sandpit'] }, BORDER);
    expect(results.some((p) => cityOf(p.id) === 'tyc')).toBe(true);
    expect(results.every((p) => p.attrs.sandpit === 'y')).toBe(true);
  });
});

describe('跨縣市距離篩選（苗栗縣）', () => {
  // 新竹市香山區與苗栗縣竹南鎮交界附近
  const BORDER = { lat: 24.73, lng: 120.92 };
  it('10 公里內同時有新竹市與苗栗縣（竹南）的場地', () => {
    const { results } = filterPlaces(places, { ...DEFAULT_FILTERS, maxKm: 10 }, BORDER);
    const cities = new Set(results.map((p) => cityOf(p.id)));
    expect(cities.has('hsc')).toBe(true);
    expect(cities.has('mlc')).toBe(true);
  });
});

describe('跨縣市距離篩選（臺北市＋新北市）', () => {
  // 中正橋附近（臺北市中正區與新北市永和區交界）
  const BORDER = { lat: 25.01, lng: 121.51 };
  it('5 公里內同時有臺北市與新北市的場地', () => {
    const { results } = filterPlaces(places, { ...DEFAULT_FILTERS, maxKm: 5 }, BORDER);
    const cities = new Set(results.map((p) => cityOf(p.id)));
    expect(cities.has('tpe')).toBe(true);
    expect(cities.has('nwt')).toBe(true);
  });
});

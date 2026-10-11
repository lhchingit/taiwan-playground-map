import { describe, expect, it } from 'vitest';
import { readAttr, type SeedFile } from '@/types/place';
import fixture from '../fixtures/seed-test.json';
import { parseOsmBounds } from '../../scripts/seed/osm-bounds';
import { toAttributeDefs, toCityRows, toSeedRows } from '../../scripts/seed/transform';

const seed = fixture as SeedFile;

describe('toSeedRows', () => {
  const rows = toSeedRows(seed);

  it('未知且沒有來源的屬性不寫入；y、n、有來源的 u 都寫入', () => {
    expect(rows.placeAttributes.map((a) => `${a.place_id}.${a.key}=${a.value}`)).toEqual([
      'test-mlc-known.slide=y',
      'test-mlc-known.toilet=n',
      'test-mlc-known.shade=u',
    ]);
  });

  it('寫入的屬性保留來源與確認日期', () => {
    expect(rows.placeAttributes[0]).toEqual({
      place_id: 'test-mlc-known',
      key: 'slide',
      value: 'y',
      note: '測試',
      source_id: 'est',
      verified_at: '2026-10-10',
    });
  });

  it('停車每個場地一列，未知也要有一列 type = u', () => {
    expect(rows.parking).toHaveLength(2);
    expect(rows.parking[1]).toMatchObject({
      place_id: 'test-mlc-unknown',
      type: 'u',
      fee: 'u',
      spaces: null,
    });
  });

  it('場地欄位改成資料表欄位名稱，未知維持 null', () => {
    expect(rows.places[1]).toMatchObject({
      id: 'test-mlc-unknown',
      city: 'mlc',
      size_class: null,
      stay_bucket: null,
      age_min: null,
      address: null,
      hours: null,
    });
  });

  it('依縣市產生範圍', () => {
    expect(rows.cities.map((c) => c.code)).toEqual(['mlc']);
  });
});

describe('toCityRows', () => {
  const osm = {
    mlc: [120.6, 24.2, 121.2, 24.8] as [number, number, number, number],
    tyc: [121.0, 24.6, 121.5, 25.1] as [number, number, number, number],
  };

  it('有場地的縣市用場地座標外擴，沒有場地的才用 OSM 行政界', () => {
    const cities = toCityRows(seed.places, osm);
    expect(cities.map((c) => [c.code, c.bboxSource])).toEqual([
      ['mlc', 'places'],
      ['tyc', 'osm'],
    ]);
    expect(cities[0]?.bbox).not.toEqual(osm.mlc);
    expect(cities[1]?.bbox).toEqual(osm.tyc);
  });

  it('沒有 OSM 資料時只產生有場地的縣市', () => {
    expect(toCityRows(seed.places, {}).map((c) => c.code)).toEqual(['mlc']);
  });
});

describe('parseOsmBounds', () => {
  it('讀出 [西, 南, 東, 北]', () => {
    expect(parseOsmBounds({ cities: { hsq: { bbox: [120.9, 24.4, 121.4, 24.9] } } })).toEqual({
      hsq: [120.9, 24.4, 121.4, 24.9],
    });
  });

  it('順序錯誤（西 > 東）時丟錯', () => {
    expect(() =>
      parseOsmBounds({ cities: { hsq: { bbox: [121.4, 24.4, 120.9, 24.9] } } }),
    ).toThrow();
  });
});

describe('toAttributeDefs', () => {
  it('保留遊樂設施分組與順序，生活機能沒有分組', () => {
    expect(toAttributeDefs(seed.labels)).toEqual([
      { key: 'slide', label: '溜滑梯', category: 'play', group_name: '滑行擺盪', sort_order: 1 },
      { key: 'sandpit', label: '沙坑', category: 'play', group_name: '玩沙玩水', sort_order: 2 },
      { key: 'toilet', label: '廁所', category: 'amenity', group_name: null, sort_order: 1 },
      { key: 'shade', label: '遮蔭', category: 'amenity', group_name: null, sort_order: 2 },
    ]);
  });
});

describe('readAttr', () => {
  it('attrs 沒有的 key 一律當成未知', () => {
    const attrs = { slide: 'y', toilet: 'n' };
    expect(readAttr(attrs, 'slide')).toBe('y');
    expect(readAttr(attrs, 'toilet')).toBe('n');
    expect(readAttr(attrs, 'skatepark')).toBe('u');
    expect(readAttr(null, 'slide')).toBe('u');
    expect(readAttr({ slide: 'true' }, 'slide')).toBe('u');
  });
});

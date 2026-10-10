import { describe, expect, it } from 'vitest';
import { nominatimUrl, parseNominatim } from '@/lib/geocode';
import { toCatalog, toCityPlace } from '@/lib/places';
import type { AttributeDef } from '@/types/place';

describe('toCatalog', () => {
  const defs: AttributeDef[] = [
    { key: 'toilet', label: '廁所', category: 'amenity', group_name: null, sort_order: 1 },
    { key: 'sandpit', label: '沙坑', category: 'play', group_name: '玩沙玩水', sort_order: 2 },
    { key: 'slide', label: '溜滑梯', category: 'play', group_name: '滑行擺盪', sort_order: 1 },
    { key: 'shade', label: '遮蔭', category: 'amenity', group_name: null, sort_order: 2 },
    { key: 'sand_table', label: '玩沙桌', category: 'play', group_name: '玩沙玩水', sort_order: 3 },
  ];
  const c = toCatalog(defs);

  it('遊樂設施依 sort_order 分組，生活機能依 sort_order', () => {
    expect(c.playGroups).toEqual([
      { name: '滑行擺盪', keys: ['slide'] },
      { name: '玩沙玩水', keys: ['sandpit', 'sand_table'] },
    ]);
    expect(c.amenity).toEqual(['toilet', 'shade']);
  });

  it('order：遊樂設施在前、生活機能在後', () => {
    expect(c.order).toEqual(['slide', 'sandpit', 'sand_table', 'toilet', 'shade']);
    expect(c.labels.sand_table).toBe('玩沙桌');
  });
});

describe('toCityPlace', () => {
  const row = {
    id: 'test-hsc-a',
    name: '測試',
    city: 'hsc',
    district: '東區',
    lat: 24.8,
    lng: 120.97,
    age_min: null,
    age_max: null,
    stay: 'lt30',
    size: 'S',
    indoor: false,
    fee: 'free',
    status: 'open',
    attrs: { slide: 'y', toilet: 'n', weird: true },
    parking: { type: 'lot', fee: 'paid', spaces: null },
  };

  it('轉成 CityPlace，未知維持 null', () => {
    expect(toCityPlace(row)).toEqual({
      ...row,
      attrs: { slide: 'y', toilet: 'n' },
    });
  });

  it('attrs 只保留 y / n / u，其他值丟棄（當成未知）', () => {
    expect(toCityPlace(row).attrs).not.toHaveProperty('weird');
  });

  it('沒有停車資料時為 type u', () => {
    expect(toCityPlace({ ...row, parking: null }).parking).toEqual({
      type: 'u',
      fee: 'u',
      spaces: null,
    });
  });
});

describe('Nominatim', () => {
  it('限台灣、繁體中文、最多 5 筆', () => {
    const url = new URL(nominatimUrl('巨城'));
    expect(url.searchParams.get('countrycodes')).toBe('tw');
    expect(url.searchParams.get('accept-language')).toBe('zh-TW');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('q')).toBe('巨城');
  });

  it('解析結果；座標不正確的略過，沒有名稱時用查詢字串', () => {
    expect(
      parseNominatim(
        [
          { lat: '24.8', lon: '120.97', name: '新竹車站', display_name: '新竹車站, 新竹市' },
          { lat: 'x', lon: '120.97', name: '壞資料' },
          { lat: '24.81', lon: '120.98', name: '', display_name: '某處' },
        ],
        '車站',
      ),
    ).toEqual([
      { lat: 24.8, lng: 120.97, name: '新竹車站', label: '新竹車站, 新竹市' },
      { lat: 24.81, lng: 120.98, name: '車站', label: '某處' },
    ]);
  });

  it('不是陣列時回傳空陣列', () => {
    expect(parseNominatim({ error: 'x' }, 'q')).toEqual([]);
  });
});

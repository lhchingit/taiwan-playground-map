import { describe, expect, it } from 'vitest';
import { launchedCityAt, type CityBounds } from '@/lib/cities';
import { parseNewPlace } from '@/lib/suggestions/form';

const CITIES: CityBounds[] = [
  {
    code: 'hsc',
    slug: 'hsinchu-city',
    name: '新竹市',
    bbox: [120.88, 24.7, 121.03, 24.86],
    launched: true,
  },
  {
    code: 'hsq',
    slug: 'hsinchu-county',
    name: '新竹縣',
    bbox: [120.9, 24.5, 121.4, 24.95],
    launched: false,
  },
  { code: 'tyc', slug: 'taoyuan', name: '桃園市', bbox: null, launched: true },
];

describe('位置在哪個已上線縣市', () => {
  it('範圍內是那個縣市', () => {
    expect(launchedCityAt({ lat: 24.8, lng: 120.97 }, CITIES)?.code).toBe('hsc');
  });
  it('只在未上線縣市的範圍內、或都不在範圍內：null', () => {
    expect(launchedCityAt({ lat: 24.6, lng: 121.2 }, CITIES)).toBeNull();
    expect(launchedCityAt({ lat: 25.03, lng: 121.56 }, CITIES)).toBeNull();
  });
});

describe('回報新場地的表單', () => {
  const ok = { lat: '24.80123456789', lng: '120.97', name: ' 新公園 ', address: '東區某路 1 號' };

  it('名稱、地址、座標（小數 7 位）、縣市', () => {
    expect(parseNewPlace(ok, 'hsc')).toEqual({
      ok: true,
      payload: {
        name: '新公園',
        lat: 24.8012346,
        lng: 120.97,
        city: 'hsc',
        address: '東區某路 1 號',
      },
    });
  });

  it('沒有標點、不在開放的縣市、沒有名稱、太長都不行', () => {
    expect(parseNewPlace({ ...ok, lat: '' }, 'hsc')).toMatchObject({
      ok: false,
      error: '請在地圖上點出場地的位置。',
    });
    expect(parseNewPlace({ ...ok, lng: 'abc' }, 'hsc')).toMatchObject({ ok: false });
    expect(parseNewPlace(ok, null)).toMatchObject({
      ok: false,
      error: '這個位置不在目前開放的縣市。',
    });
    expect(parseNewPlace({ ...ok, name: '  ' }, 'hsc')).toMatchObject({
      ok: false,
      error: '請填寫場地名稱。',
    });
    expect(parseNewPlace({ ...ok, name: '字'.repeat(51) }, 'hsc')).toMatchObject({
      ok: false,
      error: '場地名稱最多 50 個字。',
    });
    expect(parseNewPlace({ ...ok, address: '字'.repeat(101) }, 'hsc')).toMatchObject({ ok: false });
  });
});

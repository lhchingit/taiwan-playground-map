import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CITY_ORDER,
  citiesToLoad,
  distanceToBboxKm,
  nearestCity,
  sortCitiesNorthToSouth,
  type CityBounds,
} from '@/lib/cities';

// supabase/migrations 裡 INSERT INTO cities 的縣市代碼（同 data-ops.test.ts）
const migrationCodes = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .flatMap((f) => {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    return [...sql.matchAll(/INSERT INTO cities[^;]*;/g)].flatMap((m) =>
      [...m[0].matchAll(/\(\s*'([a-z]{3})'\s*,/g)].map((c) => c[1]!),
    );
  });

describe('首頁縣市清單：由北到南、離島最後', () => {
  it('照北到南排序', () => {
    const codes = ['lie', 'chw', 'tpe', 'hua', 'hsc', 'kee'].map((code) => ({ code }));
    expect(sortCitiesNorthToSouth(codes).map((c) => c.code)).toEqual([
      'kee',
      'tpe',
      'hsc',
      'chw',
      'hua',
      'lie',
    ]);
  });

  it('不在清單裡的代碼排最後，彼此照代碼排', () => {
    const codes = ['zzz', 'tst', 'pen', 'hsc'].map((code) => ({ code }));
    expect(sortCitiesNorthToSouth(codes).map((c) => c.code)).toEqual(['hsc', 'pen', 'tst', 'zzz']);
  });

  it('CITY_ORDER 跟 migrations 的縣市一致：新增縣市時忘了加，首頁清單就會排到最後', () => {
    expect(migrationCodes.length).toBeGreaterThanOrEqual(22);
    expect(new Set(CITY_ORDER).size).toBe(CITY_ORDER.length);
    expect([...CITY_ORDER].sort()).toEqual([...migrationCodes].sort());
  });
});

// 簡化的範圍，只用來測試
const city = (code: string, bbox: number[] | null): CityBounds => ({
  code,
  slug: code,
  name: code,
  bbox,
  launched: true,
});

describe('distanceToBboxKm', () => {
  const bbox = [120.9, 24.7, 121.0, 24.8];

  it('在範圍內為 0', () => {
    expect(distanceToBboxKm({ lat: 24.75, lng: 120.95 }, bbox)).toBe(0);
  });

  it('在範圍外時是到最近邊界的距離', () => {
    // 往北 0.1 度 ≈ 11.12 公里
    expect(distanceToBboxKm({ lat: 24.9, lng: 120.95 }, bbox)).toBeCloseTo(11.119, 2);
  });

  it('在角落外面時是到角落的距離', () => {
    const d = distanceToBboxKm({ lat: 24.9, lng: 121.1 }, bbox);
    expect(d).toBeGreaterThan(11.119);
  });
});

describe('citiesToLoad', () => {
  const cities = [
    city('aaa', [120.9, 24.7, 121.0, 24.8]),
    city('bbb', [121.0, 24.8, 121.3, 25.0]), // 北邊相鄰
    city('ccc', [121.5, 25.5, 121.6, 25.6]), // 很遠
    city('ddd', null), // 還沒有範圍
  ];

  it('範圍在 20 公里內的縣市都要載入，依距離排序', () => {
    expect(citiesToLoad({ lat: 24.75, lng: 120.95 }, cities)).toEqual(['aaa', 'bbb']);
  });

  it('從交界附近出發時兩邊都載入，近的先', () => {
    expect(citiesToLoad({ lat: 24.81, lng: 121.01 }, cities)).toEqual(['bbb', 'aaa']);
  });

  it('沒有範圍的縣市略過', () => {
    expect(citiesToLoad({ lat: 24.75, lng: 120.95 }, cities)).not.toContain('ddd');
  });

  it('可以指定半徑', () => {
    expect(citiesToLoad({ lat: 24.75, lng: 120.95 }, cities, 1)).toEqual(['aaa']);
  });

  it('全部都太遠時回傳空陣列', () => {
    expect(citiesToLoad({ lat: 22.6, lng: 120.3 }, cities)).toEqual([]);
  });
});

describe('nearestCity', () => {
  const cities = [
    city('aaa', [120.9, 24.7, 121.0, 24.8]),
    city('bbb', [121.0, 24.8, 121.3, 25.0]),
    city('ccc', null),
  ];

  it('在範圍內的縣市', () => {
    expect(nearestCity({ lat: 24.75, lng: 120.95 }, cities)?.code).toBe('aaa');
    expect(nearestCity({ lat: 24.9, lng: 121.2 }, cities)?.code).toBe('bbb');
  });

  it('都不在範圍內時取最近的', () => {
    expect(nearestCity({ lat: 25.2, lng: 121.2 }, cities)?.code).toBe('bbb');
  });

  it('距離相同（兩個範圍重疊）時依代碼', () => {
    expect(nearestCity({ lat: 24.8, lng: 121.0 }, cities)?.code).toBe('aaa');
  });

  it('沒有任何範圍時回傳 null', () => {
    expect(nearestCity({ lat: 24.8, lng: 121 }, [city('ccc', null)])).toBeNull();
  });
});

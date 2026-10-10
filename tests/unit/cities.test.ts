import { describe, expect, it } from 'vitest';
import { citiesToLoad, distanceToBboxKm, nearestCity, type CityBounds } from '@/lib/cities';

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

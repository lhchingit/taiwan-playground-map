import { describe, expect, it } from 'vitest';
import { estimateMinutes, haversineKm } from '@/lib/filter';

describe('haversineKm', () => {
  it('同一點為 0', () => {
    expect(haversineKm({ lat: 24.8, lng: 120.97 }, { lat: 24.8, lng: 120.97 })).toBe(0);
  });

  it('緯度差 0.1 度約 11.12 公里', () => {
    expect(haversineKm({ lat: 24.8, lng: 120.97 }, { lat: 24.9, lng: 120.97 })).toBeCloseTo(
      11.119,
      2,
    );
  });

  it('新竹火車站到新竹公園約 0.7 公里', () => {
    const km = haversineKm({ lat: 24.80163, lng: 120.97163 }, { lat: 24.799191, lng: 120.977891 });
    expect(km).toBeCloseTo(0.69, 1);
  });
});

describe('estimateMinutes（直線距離 × 1.35 ÷ 速度）', () => {
  it('開車 30、機車 25、步行 4.5 km/h', () => {
    expect(estimateMinutes(10, 'drive')).toBe(27); // 10 × 1.35 ÷ 30 × 60
    expect(estimateMinutes(10, 'scooter')).toBe(32); // 32.4
    expect(estimateMinutes(1, 'walk')).toBe(18);
  });

  it('大眾運輸不估算', () => {
    expect(estimateMinutes(10, 'transit')).toBeNull();
  });

  it('至少 1 分鐘', () => {
    expect(estimateMinutes(0, 'drive')).toBe(1);
    expect(estimateMinutes(0.05, 'drive')).toBe(1);
  });
});

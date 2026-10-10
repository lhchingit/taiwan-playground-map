import { describe, expect, it } from 'vitest';
import { bboxWithBuffer } from '../../scripts/seed/bbox';

// 兩點的大圓距離（公里），用來確認外擴量
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe('bboxWithBuffer', () => {
  const points = [
    { lat: 24.77, lng: 120.91 },
    { lat: 24.85, lng: 121.03 },
    { lat: 24.8, lng: 120.97 },
  ];
  const [w, s, e, n] = bboxWithBuffer(points, 1);

  it('回傳 [西, 南, 東, 北]，包住所有點', () => {
    expect(w).toBeLessThan(120.91);
    expect(s).toBeLessThan(24.77);
    expect(e).toBeGreaterThan(121.03);
    expect(n).toBeGreaterThan(24.85);
  });

  it('四邊都至少外擴 1 公里，但不會多太多', () => {
    for (const d of [
      km({ lat: 24.77, lng: 120.91 }, { lat: 24.77, lng: w }),
      km({ lat: 24.77, lng: 120.91 }, { lat: s, lng: 120.91 }),
      km({ lat: 24.85, lng: 121.03 }, { lat: 24.85, lng: e }),
      km({ lat: 24.85, lng: 121.03 }, { lat: n, lng: 121.03 }),
    ]) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThan(1.01);
    }
  });

  it('沒有座標時丟錯', () => {
    expect(() => bboxWithBuffer([])).toThrow();
  });
});

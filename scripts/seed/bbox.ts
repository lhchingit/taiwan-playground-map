// 用地球平均半徑換算，與距離計算（haversine，R = 6371 km）一致
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEG_LAT = (2 * Math.PI * EARTH_RADIUS_KM) / 360;

/** [西, 南, 東, 北] */
export type Bbox = [number, number, number, number];

/**
 * 座標的外框再往外擴 bufferKm 公里（decisions D12：用場地座標外擴 1 公里當縣市範圍）。
 * 經度方向用離赤道最遠的緯度換算，確保四邊都至少外擴 bufferKm。
 */
export function bboxWithBuffer(points: { lat: number; lng: number }[], bufferKm = 1): Bbox {
  if (points.length === 0) throw new Error('沒有座標，無法計算範圍');
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const farthestLat = Math.max(Math.abs(south), Math.abs(north));
  const dLat = bufferKm / KM_PER_DEG_LAT;
  const dLng = bufferKm / (KM_PER_DEG_LAT * Math.cos((farthestLat * Math.PI) / 180));
  // 取到小數 6 位，一律往外取，範圍只會變大不會變小
  const down = (n: number) => Math.floor(n * 1e6) / 1e6;
  const up = (n: number) => Math.ceil(n * 1e6) / 1e6;
  return [
    down(Math.min(...lngs) - dLng),
    down(south - dLat),
    up(Math.max(...lngs) + dLng),
    up(north + dLat),
  ];
}

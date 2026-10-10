import type { Origin } from './types';

const EARTH_RADIUS_KM = 6371;

/** 兩點的直線（大圓）距離，公里 */
export function haversineKm(a: Origin, b: Origin): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** 直線距離換算道路距離的經驗係數 */
export const DETOUR = 1.35;

export type TravelMode = 'drive' | 'scooter' | 'walk' | 'transit';

/** kmh 為 null 的交通方式不估算（大眾運輸直接連到 Google 地圖） */
export const TRAVEL_MODES: Readonly<Record<TravelMode, { label: string; kmh: number | null }>> = {
  drive: { label: '開車', kmh: 30 },
  scooter: { label: '機車', kmh: 25 },
  walk: { label: '步行', kmh: 4.5 },
  transit: { label: '大眾運輸', kmh: null },
};

/** 估算的交通時間（分鐘，至少 1 分）；介面要標示「估算」。大眾運輸回傳 null。 */
export function estimateMinutes(km: number, mode: TravelMode): number | null {
  const { kmh } = TRAVEL_MODES[mode];
  if (kmh === null) return null;
  return Math.max(1, Math.round(((km * DETOUR) / kmh) * 60));
}

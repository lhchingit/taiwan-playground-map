// 依出發點決定要載入哪些縣市（decisions D4）。純函式，距離在前端計算，出發點不送到伺服器。
import { haversineKm, type Origin } from './filter';

export interface CityBounds {
  code: string;
  slug: string;
  name: string;
  /** [西, 南, 東, 北]；null 代表還沒有範圍 */
  bbox: readonly number[] | null;
  launched: boolean;
}

/** D4：範圍與出發點距離在這個公里數內的縣市都要載入 */
export const LOAD_RADIUS_KM = 20;

/** 出發點到範圍的最短直線距離（公里）；在範圍內為 0 */
export function distanceToBboxKm(origin: Origin, bbox: readonly number[]): number {
  const [west, south, east, north] = bbox as [number, number, number, number];
  const nearest = {
    lat: Math.min(Math.max(origin.lat, south), north),
    lng: Math.min(Math.max(origin.lng, west), east),
  };
  return haversineKm(origin, nearest);
}

/** 要載入的縣市代碼，依距離由近到遠 */
export function citiesToLoad(
  origin: Origin,
  cities: readonly CityBounds[],
  radiusKm = LOAD_RADIUS_KM,
): string[] {
  return cities
    .flatMap((c) => (c.bbox ? [{ code: c.code, km: distanceToBboxKm(origin, c.bbox) }] : []))
    .filter((c) => c.km <= radiusKm)
    .sort((a, b) => a.km - b.km || a.code.localeCompare(b.code))
    .map((c) => c.code);
}

/** 離出發點最近的縣市（到範圍的距離；在範圍內為 0）。沒有任何縣市有範圍時回傳 null。 */
export function nearestCity<C extends CityBounds>(origin: Origin, cities: readonly C[]): C | null {
  let best: { city: C; km: number } | null = null;
  for (const c of cities) {
    if (!c.bbox) continue;
    const km = distanceToBboxKm(origin, c.bbox);
    if (!best || km < best.km || (km === best.km && c.code < best.city.code))
      best = { city: c, km };
  }
  return best?.city ?? null;
}

/** 這個位置在哪個已上線縣市的範圍裡（回報新場地用）；都不在時回傳 null */
export function launchedCityAt<C extends CityBounds>(
  point: Origin,
  cities: readonly C[],
): C | null {
  return (
    cities.find((c) => {
      if (!c.launched || !c.bbox) return false;
      const [west, south, east, north] = c.bbox as [number, number, number, number];
      return point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north;
    }) ?? null
  );
}

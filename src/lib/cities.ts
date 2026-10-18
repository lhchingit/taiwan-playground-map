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

/** 首頁縣市清單的順序：西部由北到南，接著東部由北到南，離島最後。新增縣市時要加進來（有測試檢查）。 */
export const CITY_ORDER: readonly string[] = [
  // 西部：基隆、臺北、新北、桃園、新竹市、新竹縣、苗栗、臺中、彰化、南投、雲林、嘉義市、嘉義縣、臺南、高雄、屏東
  ...['kee', 'tpe', 'nwt', 'tyc', 'hsc', 'hsq', 'mlc', 'txg'],
  ...['chw', 'nan', 'yun', 'cyi', 'cyq', 'tnn', 'khh', 'pif'],
  // 東部：宜蘭、花蓮、臺東
  ...['ila', 'hua', 'ttt'],
  // 離島：澎湖、金門、連江
  ...['pen', 'kin', 'lie'],
];

/** 照 CITY_ORDER 排序；不在清單裡的代碼排最後，彼此照代碼排 */
export function sortCitiesNorthToSouth<C extends { code: string }>(cities: readonly C[]): C[] {
  const rank = (code: string) => {
    const i = CITY_ORDER.indexOf(code);
    return i === -1 ? CITY_ORDER.length : i;
  };
  return [...cities].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
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

/**
 * 縣市頁面要顯示哪些縣市的場地，這個頁面的縣市排第一。
 * 距離不限（maxKm = null）時只看這個縣市：選了縣市就是想看這個縣市，
 * 有距離上限時才把附近縣市算進來（decisions D4）。
 */
export function citiesToShow(
  cityCode: string,
  origin: Origin,
  cities: readonly CityBounds[],
  maxKm: number | null,
): string[] {
  if (maxKm === null) return [cityCode];
  return [...new Set([cityCode, ...citiesToLoad(origin, cities)])];
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

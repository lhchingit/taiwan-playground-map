// 瀏覽器端：各縣市的場地資料各自快取 1 小時（decisions D4）。只送縣市代碼，不送出發點。
import type { CityPlace } from './places';

export const CITY_CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { at: number; promise: Promise<CityPlace[]> }>();

export function loadCityPlaces(code: string, now = Date.now()): Promise<CityPlace[]> {
  const hit = cache.get(code);
  if (hit && now - hit.at < CITY_CACHE_TTL_MS) return hit.promise;

  const promise = fetch(`/api/cities/${encodeURIComponent(code)}/places`).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CityPlace[];
  });
  cache.set(code, { at: now, promise });
  // 失敗的不快取，下次再試
  promise.catch(() => cache.delete(code));
  return promise;
}

/** 測試用 */
export function clearCityCache() {
  cache.clear();
}

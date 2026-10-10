// 地址搜尋：OpenStreetMap Nominatim，限台灣。瀏覽器直接查詢，不經過我們的伺服器。
// 使用政策：按下搜尋才查（不做即時建議）、每次最多 5 筆。
import type { NamedOrigin } from './origin';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export function nominatimUrl(q: string): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'tw',
    'accept-language': 'zh-TW',
    limit: '5',
    q,
  });
  return `${NOMINATIM_URL}?${params}`;
}

export interface GeoResult extends NamedOrigin {
  /** 完整地址，顯示在搜尋結果 */
  label: string;
}

export function parseNominatim(json: unknown, query: string): GeoResult[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x: Record<string, unknown>) => {
    const lat = Number(x.lat);
    const lng = Number(x.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const label = typeof x.display_name === 'string' ? x.display_name : query;
    const name = typeof x.name === 'string' && x.name ? x.name : query;
    return [{ lat, lng, name, label }];
  });
}

export async function searchAddress(q: string): Promise<GeoResult[]> {
  const res = await fetch(nominatimUrl(q));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseNominatim(await res.json(), q);
}

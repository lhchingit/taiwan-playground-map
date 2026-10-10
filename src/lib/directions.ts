// 「查實際路線」：連到 Google 地圖（D7：站內只估算，實際路線交給 Google 地圖）。
// 只有使用者按下連結時，出發點才會隨網址送到 Google；沒有出發點時由 Google 用裝置位置當起點。
import type { Origin, TravelMode } from './filter';

const GOOGLE_TRAVEL_MODE: Readonly<Record<TravelMode, string>> = {
  drive: 'driving',
  scooter: 'driving', // Google 地圖網址沒有機車模式
  walk: 'walking',
  transit: 'transit',
};

const ll = (p: Origin) => `${p.lat},${p.lng}`;

export function googleDirectionsUrl(
  dest: Origin,
  mode: TravelMode,
  origin?: Origin | null,
): string {
  const params = new URLSearchParams({ api: '1' });
  if (origin) params.set('origin', ll(origin));
  params.set('destination', ll(dest));
  params.set('travelmode', GOOGLE_TRAVEL_MODE[mode]);
  return `https://www.google.com/maps/dir/?${params}`;
}

'use client';

import { googleDirectionsUrl } from '@/lib/directions';
import type { Origin, TravelMode } from '@/lib/filter';
import { useTravelMode } from '@/lib/prefs';

/** 「查實際路線」：有出發點（首頁面板）時帶入；場地頁沒有出發點，由 Google 地圖用裝置位置 */
export function RouteLink({
  dest,
  origin,
  mode,
}: {
  dest: Origin;
  origin?: Origin | null;
  mode?: TravelMode;
}) {
  const [savedMode] = useTravelMode();
  return (
    <a
      className="btn primary"
      href={googleDirectionsUrl(dest, mode ?? savedMode, origin)}
      target="_blank"
      rel="noopener"
    >
      查實際路線（Google 地圖）
    </a>
  );
}

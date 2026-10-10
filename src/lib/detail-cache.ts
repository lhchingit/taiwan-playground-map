// 瀏覽器端：首頁詳情面板的場地詳情，快取 1 小時。
import type { PlaceDetail } from './place-detail';

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<PlaceDetail> }>();

export function loadPlaceDetail(id: string, now = Date.now()): Promise<PlaceDetail> {
  const hit = cache.get(id);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = fetch(`/api/places/${encodeURIComponent(id)}`).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as PlaceDetail;
  });
  cache.set(id, { at: now, promise });
  promise.catch(() => cache.delete(id));
  return promise;
}

// 篩選語意（CLAUDE.md 資料規則 2）：預設只有 y 通過；包含資料未知時 u（含 null 欄位）也通過；n 永遠不通過。
// 遊樂設施、生活機能是 AND；停留時長、規模、停車類型是 OR。
import { readAttr } from '@/types/place';
import { haversineKm } from './distance';
import type { FilterPlace, Filters, Origin } from './types';

/** 已知時看 known 的結果；未知時看是否包含未知 */
const tri = (known: boolean | null, includeUnknown: boolean) =>
  known === null ? includeUnknown : known;

export function passes(
  place: FilterPlace,
  km: number,
  f: Filters,
  includeUnknown: boolean,
): boolean {
  if (f.maxKm !== null && km > f.maxKm) return false;

  for (const key of [...f.play, ...f.amen]) {
    const v = readAttr(place.attrs, key);
    if (!(v === 'y' || (includeUnknown && v === 'u'))) return false;
  }

  if (
    f.stay.length > 0 &&
    !tri(place.stay === null ? null : f.stay.includes(place.stay), includeUnknown)
  )
    return false;
  if (
    f.size.length > 0 &&
    !tri(place.size === null ? null : f.size.includes(place.size), includeUnknown)
  )
    return false;

  if (f.env === 'out' && place.indoor) return false;
  if (f.env === 'in' && !place.indoor) return false;

  if (f.free && !tri(place.fee === null ? null : place.fee === 'free', includeUnknown))
    return false;

  const pk = place.parking;
  if (f.pkType.length > 0) {
    const known = pk.type === 'u' ? null : (f.pkType as string[]).includes(pk.type);
    if (!tri(known, includeUnknown)) return false;
  }
  // 選了停車費用或格數時，確定沒有停車位的場地一律不通過
  if (f.pkFee !== 'any') {
    if (pk.type === 'none') return false;
    if (!tri(pk.fee === 'u' ? null : pk.fee === f.pkFee, includeUnknown)) return false;
  }
  if (f.pkMin !== null) {
    if (pk.type === 'none') return false;
    if (!tri(pk.spaces === null ? null : pk.spaces >= f.pkMin, includeUnknown)) return false;
  }
  return true;
}

export interface FilterResult<T extends FilterPlace> {
  /** 依距離由近到遠；距離相同時依 id */
  results: (T & { km: number })[];
  /** 開啟「包含資料未知」後會多出幾處；已開啟時為 0 */
  unknownHint: number;
}

export function filterPlaces<T extends FilterPlace>(
  places: readonly T[],
  filters: Filters,
  origin: Origin,
): FilterResult<T> {
  const withKm = places.map((p) => ({ ...p, km: haversineKm(origin, p) }));
  const results = withKm
    .filter((p) => passes(p, p.km, filters, filters.includeUnknown))
    .sort((a, b) => a.km - b.km || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const unknownHint = filters.includeUnknown
    ? 0
    : withKm.filter((p) => passes(p, p.km, filters, true)).length - results.length;
  return { results, unknownHint };
}

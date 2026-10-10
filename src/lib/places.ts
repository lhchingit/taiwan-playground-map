// 前端與伺服器共用的場地型別與整理函式（資料來自 place_cards、attribute_defs view／表）。
import type { FilterPlace } from './filter';
import type {
  AttributeDef,
  ParkingFee,
  ParkingType,
  PlaceStatus,
  SizeClass,
  StayBucket,
  Tri,
} from '@/types/place';

/** 首頁清單與地圖用的場地（place_cards 的一列） */
export interface CityPlace extends FilterPlace {
  name: string;
  city: string;
  district: string | null;
  status: PlaceStatus;
}

/** 屬性字典整理成介面需要的形狀；順序都依 attribute_defs 的 sort_order */
export interface AttributeCatalog {
  labels: Record<string, string>;
  playGroups: { name: string; keys: string[] }[];
  amenity: string[];
  /** 遊樂設施在前、生活機能在後 */
  order: string[];
}

export function toCatalog(defs: readonly AttributeDef[]): AttributeCatalog {
  const sorted = [...defs].sort(
    (a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key),
  );
  const playGroups: AttributeCatalog['playGroups'] = [];
  for (const d of sorted.filter((d) => d.category === 'play')) {
    const name = d.group_name ?? '其他';
    const group = playGroups.find((g) => g.name === name);
    if (group) group.keys.push(d.key);
    else playGroups.push({ name, keys: [d.key] });
  }
  const amenity = sorted.filter((d) => d.category === 'amenity').map((d) => d.key);
  return {
    labels: Object.fromEntries(sorted.map((d) => [d.key, d.label])),
    playGroups,
    amenity,
    order: [...playGroups.flatMap((g) => g.keys), ...amenity],
  };
}

const TRI = new Set(['y', 'n', 'u']);

/** place_cards 的一列 → CityPlace。view 的欄位型別都是可為 null，這裡集中檢查。 */
export function toCityPlace(row: Record<string, unknown>): CityPlace {
  const attrs: Record<string, Tri> = {};
  for (const [k, v] of Object.entries((row.attrs as Record<string, unknown> | null) ?? {})) {
    if (typeof v === 'string' && TRI.has(v)) attrs[k] = v as Tri;
  }
  const pk = (row.parking as Record<string, unknown> | null) ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    id: String(row.id),
    name: String(row.name),
    city: String(row.city),
    district: (row.district as string | null) ?? null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    age_min: num(row.age_min),
    age_max: num(row.age_max),
    stay: (row.stay as StayBucket | null) ?? null,
    size: (row.size as SizeClass | null) ?? null,
    indoor: row.indoor === true,
    fee: (row.fee as 'free' | 'paid' | null) ?? null,
    status: (row.status as PlaceStatus | null) ?? 'open',
    attrs,
    parking: {
      type: (pk.type as ParkingType | undefined) ?? 'u',
      fee: (pk.fee as ParkingFee | undefined) ?? 'u',
      spaces: num(pk.spaces),
    },
  };
}

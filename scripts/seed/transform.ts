// places.json → 各資料表的列。純函式，不碰資料庫。
// 列的型別用 type 而不是 interface，才能直接傳給 postgres.js 的 sql.json()。
import type {
  AttributeCategory,
  ParkingFee,
  ParkingType,
  SeedFile,
  SourceKind,
  Tri,
} from '../../src/types/place';
import { bboxWithBuffer, type Bbox } from './bbox';

export type SourceRow = {
  id: string;
  label: string;
  url: string | null;
  kind: SourceKind;
};

export type AttributeDefRow = {
  key: string;
  label: string;
  category: AttributeCategory;
  group_name: string | null;
  sort_order: number;
};

/** 對應 places 表；座標另外用 lat / lng，寫入時轉成 geom */
export type PlaceRow = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string | null;
  lat: number;
  lng: number;
  size_class: string | null;
  stay_bucket: string | null;
  stay_source: string | null;
  age_min: number | null;
  age_max: number | null;
  fee: string | null;
  indoor: boolean;
  hours: string | null;
  surface: string | null;
  status: string;
  summary: string | null;
  /** 座標來源說明（OSM 編號等） */
  coord_source: string | null;
};

export type PlaceAttributeRow = {
  place_id: string;
  key: string;
  value: Tri;
  note: string | null;
  source_id: string | null;
  verified_at: string | null;
};

export type ParkingRow = {
  place_id: string;
  type: ParkingType;
  fee: ParkingFee;
  spaces: number | null;
  note: string | null;
  source_id: string | null;
  verified_at: string | null;
};

export type CityRow = {
  code: string;
  bbox: Bbox;
  /** places：場地座標外擴 1 公里；osm：OSM 行政界 */
  bboxSource: 'places' | 'osm';
};

export interface SeedRows {
  sources: SourceRow[];
  attributeDefs: AttributeDefRow[];
  cities: CityRow[];
  places: PlaceRow[];
  placeAttributes: PlaceAttributeRow[];
  parking: ParkingRow[];
}

/** 遊樂設施依 play_groups 的分組與順序；生活機能依 labels.amenity 的順序。sort_order 在各類別內從 1 開始。 */
export function toAttributeDefs(labels: SeedFile['labels']): AttributeDefRow[] {
  const play = labels.play_groups.flatMap((g) =>
    g.keys.map((key) => ({ key, group_name: g.name })),
  );
  return [
    ...play.map(({ key, group_name }, i) => ({
      key,
      label: labels.play[key] ?? key,
      category: 'play' as const,
      group_name,
      sort_order: i + 1,
    })),
    ...Object.entries(labels.amenity).map(([key, label], i) => ({
      key,
      label,
      category: 'amenity' as const,
      group_name: null,
      sort_order: i + 1,
    })),
  ];
}

/**
 * 縣市範圍：有場地的縣市用場地座標外擴 1 公里；沒有場地的縣市用 OSM 行政界
 * （data/raw/osm-city-bounds.json），讓前端能判斷出發點附近要載入哪些縣市（decisions D4）。
 */
export function toCityRows(places: SeedFile['places'], osmBounds: Readonly<Record<string, Bbox>>) {
  const byCity = new Map<string, { lat: number; lng: number }[]>();
  for (const p of places) byCity.set(p.city, [...(byCity.get(p.city) ?? []), p]);
  return [
    ...[...byCity].map(([code, points]) => ({
      code,
      bbox: bboxWithBuffer(points, 1),
      bboxSource: 'places' as const,
    })),
    ...Object.entries(osmBounds)
      .filter(([code]) => !byCity.has(code))
      .map(([code, bbox]) => ({ code, bbox, bboxSource: 'osm' as const })),
  ];
}

export function toSeedRows(
  seed: SeedFile,
  osmBounds: Readonly<Record<string, Bbox>> = {},
): SeedRows {
  const sources = Object.entries(seed.sources).map(([id, s]) => ({
    id,
    label: s.label,
    url: s.url,
    kind: s.kind,
  }));

  const cities = toCityRows(seed.places, osmBounds);

  const places = seed.places.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    district: p.district,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    size_class: p.size,
    stay_bucket: p.stay,
    stay_source: p.stay_src,
    age_min: p.age_min,
    age_max: p.age_max,
    fee: p.fee,
    indoor: p.indoor,
    hours: p.hours,
    surface: p.surface,
    status: p.status,
    summary: p.summary,
    coord_source: p.source_coords ?? null,
  }));

  // 沒有資料列 = 未知：值為 u 且沒有來源的屬性不寫入；u 但有來源（查過但無法確認）保留紀錄
  const placeAttributes = seed.places.flatMap((p) =>
    Object.entries(p.attrs)
      .filter(([, a]) => a.v !== 'u' || a.src !== null)
      .map(([key, a]) => ({
        place_id: p.id,
        key,
        value: a.v,
        note: a.note,
        source_id: a.src,
        verified_at: a.at,
      })),
  );

  // 停車每個場地一列，未知也要寫（type = 'u'）
  const parking = seed.places.map((p) => ({
    place_id: p.id,
    type: p.parking.type,
    fee: p.parking.fee,
    spaces: p.parking.spaces,
    note: p.parking.note,
    source_id: p.parking.src,
    verified_at: p.parking.at,
  }));

  return {
    sources,
    attributeDefs: toAttributeDefs(seed.labels),
    cities,
    places,
    placeAttributes,
    parking,
  };
}

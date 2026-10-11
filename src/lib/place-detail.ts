// 場地詳情（場地頁與首頁詳情面板共用）。純函式，不依賴 React。
import type { AttributeCatalog, CityPlace } from './places';
import type { ParkingFee, ParkingType, SourceKind, Tri } from '@/types/place';

export interface SourceRef {
  id: string;
  label: string;
  url: string | null;
  kind: SourceKind;
}

/** 一個屬性的值與出處；資料庫沒有資料列的屬性不會出現在這裡（= 未知） */
export interface AttrFact {
  key: string;
  v: Tri;
  note: string | null;
  source: SourceRef | null;
  verifiedAt: string | null;
}

export interface ParkingFact {
  type: ParkingType;
  fee: ParkingFee;
  feeNote: string | null;
  spaces: number | null;
  distanceM: number | null;
  note: string | null;
  source: SourceRef | null;
  verifiedAt: string | null;
}

export interface PlaceDetail extends CityPlace {
  address: string | null;
  hours: string | null;
  surface: string | null;
  summary: string | null;
  areaHa: number | null;
  /** 建議停留時長的依據（目前都是「依面積與設施推估」） */
  staySource: SourceRef | null;
  /** 座標來源說明，例：OpenStreetMap w448662016（清冊編號 94） */
  coordSource: string | null;
  /** 開放時間、地面材質的來源（使用者回報經審核後套用時才有） */
  hoursRef: FieldRef | null;
  surfaceRef: FieldRef | null;
  /** 維修中／已封閉的說明（status 在 CityPlace） */
  statusInfo: StatusInfo | null;
  facts: AttrFact[];
  /** 至少一列；沒有資料時是一列 type u */
  parkingRows: ParkingFact[];
}

export interface FieldRef {
  source: SourceRef | null;
  verifiedAt: string | null;
}

export interface StatusInfo extends FieldRef {
  until: string | null;
  note: string | null;
}

export interface FactRow extends AttrFact {
  label: string;
}

export interface FactSection {
  title: string;
  groups: { name: string | null; rows: FactRow[] }[];
  /** 還沒有資料的項目名稱 */
  unknown: string[];
}

/**
 * 原型的詳情：已知的（y／n，或 u 但有來源）逐列顯示並附來源；未知的收成一行「還沒有資料：…」。
 * 遊樂設施依分組，生活機能不分組；順序依 attribute_defs。
 */
export function factSections(facts: readonly AttrFact[], catalog: AttributeCatalog): FactSection[] {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const known = (k: string) => {
    const f = byKey.get(k);
    return f && (f.v !== 'u' || f.source !== null) ? f : null;
  };
  const label = (k: string) => catalog.labels[k] ?? k;
  const section = (title: string, groups: { name: string | null; keys: string[] }[]) => {
    const keys = groups.flatMap((g) => g.keys);
    return {
      title,
      groups: groups
        .map((g) => ({
          name: g.name,
          rows: g.keys.flatMap((k) => {
            const f = known(k);
            return f ? [{ ...f, label: label(k) }] : [];
          }),
        }))
        .filter((g) => g.rows.length > 0),
      unknown: keys.filter((k) => !known(k)).map(label),
    };
  };
  return [
    section('遊樂設施', catalog.playGroups),
    section('生活機能', [{ name: null, keys: catalog.amenity }]),
  ];
}

const KIND_ORDER: SourceKind[] = [
  'open_data',
  'survey',
  'user',
  'news',
  'article',
  'lead',
  'estimate',
];

/** 這一頁用到的來源（去重），官方資料在前、網友線索與推估在後 */
export function pageSources(d: PlaceDetail): SourceRef[] {
  const all = [
    ...d.facts.map((f) => f.source),
    ...d.parkingRows.map((p) => p.source),
    d.staySource,
  ].filter((s): s is SourceRef => s !== null);
  const unique = [...new Map(all.map((s) => [s.id, s])).values()];
  return unique.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id),
  );
}

type Row = Record<string, unknown>;

function toSource(s: unknown): SourceRef | null {
  if (!s || typeof s !== 'object') return null;
  const r = s as Row;
  return {
    id: String(r.id),
    label: String(r.label),
    url: (r.url as string | null) ?? null,
    kind: r.kind as SourceKind,
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v));

/** 資料庫的列（PostgREST，來源用 sources(...) 一起查）→ PlaceDetail */
export function toPlaceDetail(input: {
  card: CityPlace;
  place: Row;
  attributes: Row[];
  parking: Row[];
  sources: readonly SourceRef[];
}): PlaceDetail {
  const { card, place } = input;
  const facts = input.attributes.map((a) => ({
    key: String(a.key),
    v: (String(a.value).trim() as Tri) || 'u',
    note: str(a.note),
    source: toSource(a.sources),
    verifiedAt: str(a.verified_at),
  }));
  const parkingRows: ParkingFact[] = input.parking.map((p) => ({
    type: p.type as ParkingType,
    fee: p.fee as ParkingFee,
    feeNote: str(p.fee_note),
    spaces: num(p.spaces),
    distanceM: num(p.distance_m),
    note: str(p.note),
    source: toSource(p.sources),
    verifiedAt: str(p.verified_at),
  }));
  const stayId = str(place.stay_source);
  const source = (id: unknown) => input.sources.find((s) => s.id === str(id)) ?? null;
  const ref = (src: unknown, at: unknown): FieldRef | null =>
    str(src) ? { source: source(src), verifiedAt: str(at) } : null;
  const closed = card.status === 'maintenance' || card.status === 'closed';
  return {
    ...card,
    address: str(place.address),
    hours: str(place.hours),
    surface: str(place.surface),
    summary: str(place.summary),
    areaHa: num(place.area_ha),
    staySource: input.sources.find((s) => s.id === stayId) ?? null,
    coordSource: str(place.coord_source),
    hoursRef: ref(place.hours_source, place.hours_verified_at),
    surfaceRef: ref(place.surface_source, place.surface_verified_at),
    statusInfo: closed
      ? {
          until: str(place.status_until),
          note: str(place.status_note),
          source: source(place.status_source),
          verifiedAt: str(place.status_verified_at),
        }
      : null,
    facts,
    parkingRows:
      parkingRows.length > 0
        ? parkingRows
        : [
            {
              type: 'u',
              fee: 'u',
              feeNote: null,
              spaces: null,
              distanceM: null,
              note: null,
              source: null,
              verifiedAt: null,
            },
          ],
  };
}

const STATUS_LABEL: Record<string, string> = { maintenance: '維修中', closed: '已封閉' };

/** 場地狀態的提醒（維修中、已封閉）；開放或季節性開放時是 null。today：YYYY-MM-DD（台灣時間） */
export function statusNotice(
  status: string,
  info: Pick<StatusInfo, 'until' | 'note'> | null,
  today: string,
): string | null {
  const label = STATUS_LABEL[status];
  if (!label) return null;
  let text = info?.note ? `${label}：${info.note}` : label;
  if (info?.until) {
    text += `（預計 ${info.until} 恢復）`;
    if (info.until < today) text += '。已過預計恢復日期，可能已經恢復，出發前請先確認';
  }
  return text;
}

export function feeText(fee: 'free' | 'paid' | null): string {
  return fee === 'free' ? '免費' : fee === 'paid' ? '收費' : '未知';
}

/** 地址待補時顯示行政區 */
export function addressText(d: { address: string | null; district: string | null }): string {
  return d.address ?? `${d.district ?? ''}（地址待補）`;
}

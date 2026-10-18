// 領域型別，對應 data/seed/<縣市>/places.json 的結構。資料庫型別在 ./database.ts（supabase gen types 產生）。

/** 三態：y 有／n 無／u 未知。沒有資料就是 u，絕不能當成 n。 */
export type Tri = 'y' | 'n' | 'u';

export type SourceKind = 'open_data' | 'article' | 'news' | 'lead' | 'estimate' | 'user' | 'survey';

export interface SourceDef {
  label: string;
  url: string | null;
  kind: SourceKind;
}

/** 單一屬性的值與來源；v 為 y / n 時一定有 src 與 at */
export interface AttrValue {
  v: Tri;
  src: string | null;
  note: string | null;
  /** 確認日期 YYYY-MM-DD */
  at: string | null;
}

export type ParkingType = 'lot' | 'street' | 'none' | 'u';
export type ParkingFee = 'free' | 'paid' | 'u';

export interface Parking {
  type: ParkingType;
  fee: ParkingFee;
  /** null = 未知 */
  spaces: number | null;
  src: string | null;
  note: string | null;
  at: string | null;
}

export type SizeClass = 'S' | 'M' | 'L';
export type StayBucket = 'lt30' | '30_60' | '60_120' | 'half';
export type PlaceStatus = 'open' | 'seasonal' | 'maintenance' | 'closed';

export interface OfficialRef {
  hccg_no: number;
  name: string;
  items: string;
}

export interface Place {
  id: string;
  name: string;
  /** 縣市代碼（hsc），不是中文名稱 */
  city: string;
  district: string | null;
  /** null = 未知 */
  address: string | null;
  lat: number;
  lng: number;
  size: SizeClass | null;
  /** 面積（公頃），來自公園管理維護地點資料；null = 未知 */
  area_ha?: number | null;
  stay: StayBucket | null;
  stay_src: string | null;
  /** null = 未知 */
  age_min: number | null;
  /** null = 未知 */
  age_max: number | null;
  fee: 'free' | 'paid' | null;
  indoor: boolean;
  /** null = 未知 */
  hours: string | null;
  surface: string | null;
  status: PlaceStatus;
  summary: string | null;
  attrs: Record<string, AttrValue>;
  parking: Parking;
  /** 座標來源說明（OSM 編號等），尚未存進資料庫 */
  source_coords?: string;
  /** 場地本身的依據（來源 key）：OSM 只畫了公園、依新聞或文章上地圖的場地（decisions D20） */
  listing_src?: string | null;
  /** 場地依據的確認日期（YYYY-MM-DD） */
  listing_at?: string | null;
  /** 對應的官方清冊資料，尚未存進資料庫 */
  official_ref?: OfficialRef[];
}

export type AttributeCategory = 'play' | 'amenity';

export interface AttributeDef {
  key: string;
  label: string;
  category: AttributeCategory;
  /** 遊樂設施的分組；生活機能為 null */
  group_name: string | null;
  sort_order: number;
}

export interface SeedFile {
  version: string;
  city: string;
  generated: string;
  sources: Record<string, SourceDef>;
  labels: {
    play: Record<string, string>;
    play_groups: { name: string; keys: string[] }[];
    amenity: Record<string, string>;
  };
  places: Place[];
}

/**
 * 讀 places.attrs（資料庫的查詢用 JSONB）。attrs 只存 y / n，
 * 沒有這個 key 就代表未知，一律回傳 u。
 */
export function readAttr(
  attrs: Readonly<Record<string, unknown>> | null | undefined,
  key: string,
): Tri {
  const v = attrs?.[key];
  return v === 'y' || v === 'n' ? v : 'u';
}

import type { ParkingFee, ParkingType, SizeClass, StayBucket, Tri } from '@/types/place';

export type Env = 'all' | 'in' | 'out';
export type ParkingTypeFilter = Exclude<ParkingType, 'none' | 'u'>;
export type ParkingFeeFilter = 'any' | Exclude<ParkingFee, 'u'>;

/** 篩選條件。出發點刻意不放在這裡，避免被寫進可分享的網址。 */
export interface Filters {
  /** 直線距離上限（公里），null = 不限 */
  maxKm: number | null;
  /** 孩子年齡，null = 不限 */
  age: number | null;
  /** 遊樂設施，全部都要有（AND） */
  play: string[];
  /** 生活機能，全部都要有（AND） */
  amen: string[];
  /** 停留時長，符合其中一個即可（OR） */
  stay: StayBucket[];
  /** 場地規模，符合其中一個即可（OR） */
  size: SizeClass[];
  env: Env;
  /** 只看免費 */
  free: boolean;
  /** 包含資料未知：u（含 null 欄位）也通過 */
  includeUnknown: boolean;
  /** 停車類型，符合其中一個即可（OR） */
  pkType: ParkingTypeFilter[];
  pkFee: ParkingFeeFilter;
  /** 最少停車格數，null = 不限 */
  pkMin: number | null;
}

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  maxKm: null,
  age: null,
  play: [],
  amen: [],
  stay: [],
  size: [],
  env: 'all',
  free: false,
  includeUnknown: false,
  pkType: [],
  pkFee: 'any',
  pkMin: null,
});

/** 篩選需要的最小欄位；null 都代表未知 */
export interface FilterPlace {
  id: string;
  lat: number;
  lng: number;
  age_min: number | null;
  age_max: number | null;
  stay: StayBucket | null;
  size: SizeClass | null;
  indoor: boolean;
  fee: 'free' | 'paid' | null;
  /** 跟資料庫 places.attrs 同樣的形狀：沒有的 key 代表未知 */
  attrs: Readonly<Record<string, Tri>>;
  parking: { type: ParkingType; fee: ParkingFee; spaces: number | null };
}

export interface Origin {
  lat: number;
  lng: number;
}

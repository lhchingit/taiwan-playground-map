// 介面文字與格式（沿用原型用字）。純函式，不依賴 React。
import { DEFAULT_FILTERS, estimateMinutes, type Filters, type TravelMode } from './filter';
import type { ParkingFee, ParkingType, SizeClass, StayBucket, Tri } from '@/types/place';

export const STAY_LABEL: Readonly<Record<StayBucket, string>> = {
  lt30: '30 分鐘內',
  '30_60': '30 分–1 小時',
  '60_120': '1–2 小時',
  half: '半天以上',
};
export const SIZE_LABEL: Readonly<Record<SizeClass, string>> = {
  S: '小型（社區）',
  M: '中型',
  L: '大型',
};
export const PARKING_TYPE_LABEL: Readonly<Record<ParkingType, string>> = {
  lot: '停車場',
  street: '路邊停車格',
  none: '無停車位',
  u: '類型未知',
};
export const PARKING_FEE_LABEL: Readonly<Record<ParkingFee, string>> = {
  free: '免費',
  paid: '付費',
  u: '費用未知',
};
export const TRI_LABEL: Readonly<Record<Tri, string>> = { y: '有', n: '無', u: '未知' };

/** 1 公里內用公尺，其餘到小數一位 */
export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`;
}

/** 卡片上的距離：「1.2 公里．約 3 分」；大眾運輸只顯示距離 */
export function distanceText(km: number, mode: TravelMode): string {
  const min = estimateMinutes(km, mode);
  return min === null ? formatKm(km) : `${formatKm(km)}．約 ${min} 分`;
}

export function ageText(p: { age_min: number | null; age_max: number | null }): string {
  return p.age_min === null || p.age_max === null ? '年齡未知' : `${p.age_min}–${p.age_max} 歲`;
}

export function stayText(stay: StayBucket | null): string {
  return stay === null ? '時間未知' : STAY_LABEL[stay];
}

/** 停車摘要：「停車場．付費．約 40 格」 */
export function parkingText(pk: {
  type: ParkingType;
  fee: ParkingFee;
  spaces: number | null;
}): string {
  if (pk.type === 'none') return '無停車位';
  const parts = [PARKING_TYPE_LABEL[pk.type]];
  if (pk.fee !== 'u') parts.push(PARKING_FEE_LABEL[pk.fee]);
  if (pk.spaces !== null) parts.push(`約 ${pk.spaces} 格`);
  return parts.join('．');
}

/** 停車標籤的狀態：沒有停車位 = n、類型未知 = u、其他 = y */
export function parkingTri(type: ParkingType): Tri {
  return type === 'none' ? 'n' : type === 'u' ? 'u' : 'y';
}

/** 停車條件是否有選（有選時卡片要顯示停車標籤） */
export function parkingFilterOn(f: Filters): boolean {
  return f.pkType.length > 0 || f.pkFee !== 'any' || f.pkMin !== null;
}

/** 已選的條件數（篩選面板標題旁的「N 項」；包含資料未知不算條件） */
export function activeFilterCount(f: Filters): number {
  const d = DEFAULT_FILTERS;
  return (
    f.play.length +
    f.groups.length +
    f.amen.length +
    f.stay.length +
    f.pkType.length +
    Number(f.pkFee !== d.pkFee) +
    Number(f.pkMin !== d.pkMin) +
    Number(f.maxKm !== d.maxKm) +
    Number(f.env !== d.env) +
    Number(f.free)
  );
}

/**
 * 卡片上的屬性標籤：有選條件時顯示選的項目（含狀態）；
 * 沒選時顯示前 6 項「有」，順序依 attribute_defs（遊樂設施分組在前、生活機能在後）。
 */
export function cardTags(
  attrs: Readonly<Record<string, Tri | undefined>>,
  selected: readonly string[],
  orderedKeys: readonly string[],
): { key: string; v: Tri }[] {
  const v = (k: string): Tri => attrs[k] ?? 'u';
  if (selected.length > 0) return selected.map((key) => ({ key, v: v(key) }));
  return orderedKeys
    .filter((k) => v(k) === 'y')
    .slice(0, 6)
    .map((key) => ({ key, v: 'y' as const }));
}

/**
 * 選了遊樂設施類別時（decisions D26），卡片要列出的屬性：這一類裡場地「有」的項目；
 * 一項都沒有（靠「包含資料未知」通過）時列出未知的項目。
 */
export function groupTagKeys(
  attrs: Readonly<Record<string, Tri | undefined>>,
  groups: readonly string[],
  groupKeys: Readonly<Record<string, readonly string[]>>,
): string[] {
  return groups.flatMap((id) => {
    const keys = groupKeys[id] ?? [];
    const yes = keys.filter((k) => attrs[k] === 'y');
    return yes.length > 0 ? yes : keys.filter((k) => (attrs[k] ?? 'u') === 'u');
  });
}

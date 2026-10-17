// 儲存篩選條件（decisions D27）：名稱的預設值與檢查。純函式，不依賴 React，有單元測試。
// 條件存成分享網址的 query string（filtersToQuery），出發點不在裡面。
import { DEFAULT_FILTERS, type Filters } from './filter';
import { PARKING_TYPE_LABEL, STAY_LABEL } from './format';
import { groupId } from './play-groups';

/** 每個人最多幾組（資料庫的 saved_filters_limit trigger 也是 5） */
export const MAX_SAVED_FILTERS = 5;
/** 名稱最多幾個字（資料庫 CHECK 也是 20） */
export const SAVED_NAME_MAX = 20;

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
}

interface SummaryCatalog {
  labels: Readonly<Record<string, string>>;
  playGroups: readonly { name: string; keys: readonly string[] }[];
}

/** 條件摘要，例如「沙坑＋廁所＋5 公里內」；順序同篩選面板 */
export function filterSummary(f: Filters, catalog: SummaryCatalog): string {
  const label = (k: string) => catalog.labels[k] ?? k;
  const parts: string[] = [];
  if (f.maxKm !== DEFAULT_FILTERS.maxKm) parts.push(`${f.maxKm} 公里內`);
  for (const g of catalog.playGroups) {
    const id = groupId(g.name);
    if (id && f.groups.includes(id)) parts.push(`${g.name}（任一種）`);
    for (const k of g.keys) if (f.play.includes(k)) parts.push(label(k));
  }
  parts.push(...f.amen.map(label));
  parts.push(...f.pkType.map((t) => PARKING_TYPE_LABEL[t]));
  if (f.pkFee !== 'any') parts.push(f.pkFee === 'free' ? '停車免費' : '停車付費');
  if (f.pkMin !== null) parts.push(`至少 ${f.pkMin} 格`);
  parts.push(...f.stay.map((s) => `停留 ${STAY_LABEL[s]}`));
  if (f.env !== 'all') parts.push(f.env === 'in' ? '室內' : '戶外');
  if (f.free) parts.push('免費');
  if (f.includeUnknown) parts.push('含資料未知');
  return parts.join('＋');
}

/** 名稱的預設值：條件摘要，太長就截斷加「…」 */
export function defaultSavedName(f: Filters, catalog: SummaryCatalog): string {
  const s = filterSummary(f, catalog) || '我的篩選';
  const chars = [...s];
  return chars.length <= SAVED_NAME_MAX ? s : chars.slice(0, SAVED_NAME_MAX - 1).join('') + '…';
}

/** 名稱檢查；通過回傳 null */
export function checkSavedName(name: string): string | null {
  const n = [...name.trim()].length;
  if (n === 0) return '請輸入名稱。';
  if (n > SAVED_NAME_MAX) return `名稱最多 ${SAVED_NAME_MAX} 個字。`;
  return null;
}

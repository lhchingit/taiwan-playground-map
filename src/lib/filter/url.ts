// 篩選條件 ↔ 網址 query string，方便家長分享連結。出發點不在 Filters 裡，不會出現在網址。
// 解析時不合法的值直接丟棄、不丟錯：壞掉或過期的分享連結也要能打開。
import type { SizeClass, StayBucket } from '@/types/place';
import { DEFAULT_FILTERS, type Env, type Filters, type ParkingTypeFilter } from './types';

/** 原型的距離滑桿：1–20 公里，21 = 不限 */
export const MAX_KM_OPTIONS = { min: 1, max: 20 } as const;
/** 原型的年齡選單（10 = 9–10 歲、12 = 11–12 歲） */
export const AGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;

const STAY: readonly StayBucket[] = ['lt30', '30_60', '60_120', 'half'];
const SIZE: readonly SizeClass[] = ['S', 'M', 'L'];
const PK_TYPE: readonly ParkingTypeFilter[] = ['lot', 'street'];

export interface KnownAttrKeys {
  play: readonly string[];
  amen: readonly string[];
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const picked = new Set(raw.split(',').map((s) => s.trim()));
  return allowed.filter((v) => picked.has(v)).sort();
}

function parseInt10(raw: string | null): number | null {
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

export function queryToFilters(query: URLSearchParams | string, known: KnownAttrKeys): Filters {
  const q = typeof query === 'string' ? new URLSearchParams(query) : query;

  const km = parseInt10(q.get('km'));
  const age = parseInt10(q.get('age'));
  const pkMin = parseInt10(q.get('pkmin'));
  const env = q.get('env');
  const pkFee = q.get('pkfee');

  return {
    maxKm: km !== null && km >= MAX_KM_OPTIONS.min && km <= MAX_KM_OPTIONS.max ? km : null,
    age: age !== null && (AGE_OPTIONS as readonly number[]).includes(age) ? age : null,
    play: parseList(q.get('play'), known.play),
    amen: parseList(q.get('amen'), known.amen),
    stay: parseList(q.get('stay'), STAY),
    size: parseList(q.get('size'), SIZE),
    env: env === 'in' || env === 'out' ? (env satisfies Env) : 'all',
    free: q.get('free') === '1',
    includeUnknown: q.get('unk') === '1',
    pkType: parseList(q.get('pk'), PK_TYPE),
    pkFee: pkFee === 'free' || pkFee === 'paid' ? pkFee : 'any',
    pkMin: pkMin !== null && pkMin > 0 ? pkMin : null,
  };
}

/**
 * 只輸出跟預設不同的條件，順序固定、陣列排序，同樣的條件一定得到同樣的網址。
 * 逗號不編碼（?play=sandpit,slide），連結比較好讀。不含開頭的「?」。
 */
export function filtersToQuery(f: Filters): string {
  const parts: [string, string][] = [];
  const list = (key: string, values: readonly string[]) => {
    if (values.length > 0) parts.push([key, [...new Set(values)].sort().join(',')]);
  };
  list('play', f.play);
  list('amen', f.amen);
  if (f.age !== DEFAULT_FILTERS.age) parts.push(['age', String(f.age)]);
  if (f.maxKm !== DEFAULT_FILTERS.maxKm) parts.push(['km', String(f.maxKm)]);
  list('stay', f.stay);
  list('size', f.size);
  if (f.env !== DEFAULT_FILTERS.env) parts.push(['env', f.env]);
  if (f.free) parts.push(['free', '1']);
  list('pk', f.pkType);
  if (f.pkFee !== DEFAULT_FILTERS.pkFee) parts.push(['pkfee', f.pkFee]);
  if (f.pkMin !== DEFAULT_FILTERS.pkMin) parts.push(['pkmin', String(f.pkMin)]);
  if (f.includeUnknown) parts.push(['unk', '1']);
  return parts.map(([k, v]) => `${k}=${v.split(',').map(encodeURIComponent).join(',')}`).join('&');
}

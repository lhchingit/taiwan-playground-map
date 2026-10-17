// 清快取 API（/api/revalidate）的驗證與要清的 tag。縣市上線／下線、重新匯入後呼叫，讓變更立刻生效。
import { timingSafeEqual } from 'node:crypto';

/** Authorization: Bearer <secret>，以固定時間比對；沒設定密鑰時一律不通過 */
export function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const CITY_CODE = /^[a-z]{3}$/;

/**
 * 要清除的 tag（對應 src/lib/data.ts 的 cacheTag）。
 * 指定縣市時只清那個縣市；沒指定時清全部共用資料（縣市、屬性字典、來源、場地清單）。
 */
export function revalidationTags(city: unknown): string[] | null {
  if (city === undefined || city === null) {
    return ['cities', 'attribute_defs', 'sources', 'places', 'naming-settings'];
  }
  if (typeof city !== 'string' || !CITY_CODE.test(city)) return null;
  return ['cities', 'places', `places:${city}`, `city:${city}`];
}

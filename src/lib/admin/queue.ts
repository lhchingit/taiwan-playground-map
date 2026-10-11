// 審核後台的待審清單：依「場地＋項目」分組，標出意見不一致的（純函式，有單元測試）。
// 「同一個項目」的定義跟資料庫的 edit_suggestions_pending_once 相同：屬性看 key、基本資料看欄位，停車、封閉各算一項。
import type { Json } from '@/types/database';

export interface QueueItem {
  id: number;
  kind: string;
  placeId: string | null;
  payload: Json;
  createdAt: string;
}

export interface QueueGroup<T extends QueueItem> {
  key: string;
  items: T[];
  /** 同一組有兩筆以上、而且建議的內容不同 */
  conflict: boolean;
}

function obj(p: Json): Record<string, Json | undefined> {
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, Json>) : {};
}

/** 分組用的項目：attribute → key、field → 欄位、其他 → 類型本身 */
export function itemKey(kind: string, payload: Json): string {
  const p = obj(payload);
  if (kind === 'attribute') return `attribute:${String(p.key ?? '')}`;
  if (kind === 'field') return `field:${String(p.field ?? '')}`;
  return kind;
}

/** 比較「建議的內容」：不看補充說明，只看會套用的值 */
function proposal(kind: string, payload: Json): string {
  const p = obj(payload);
  switch (kind) {
    case 'attribute':
      return String(p.value ?? '');
    case 'field':
      return String(p.value ?? '').trim();
    case 'parking':
      return [p.type, p.fee ?? 'u', p.spaces ?? ''].join('|');
    case 'closure':
      return [p.status ?? 'maintenance', p.until ?? ''].join('|');
    default:
      return JSON.stringify(p);
  }
}

/** 依第一筆的建立時間排序（最舊的在前），組內也是最舊的在前；新增場地每筆各自一組 */
export function groupQueue<T extends QueueItem>(items: readonly T[]): QueueGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const it of [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
  )) {
    const key =
      it.placeId === null ? `new:${it.id}` : `${it.placeId}|${itemKey(it.kind, it.payload)}`;
    const list = groups.get(key);
    if (list) list.push(it);
    else groups.set(key, [it]);
  }
  return [...groups].map(([key, list]) => ({
    key,
    items: list,
    conflict: list.length > 1 && new Set(list.map((i) => proposal(i.kind, i.payload))).size > 1,
  }));
}

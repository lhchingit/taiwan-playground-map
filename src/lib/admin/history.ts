// 修改紀錄頁的文字整理（純函式，有單元測試）：值 → 有／無／未知、來源 id → 名稱、修改者 → 暱稱或「匯入」。

const TRI: Record<string, string> = { y: '有', n: '無', u: '未知' };
const STATUS: Record<string, string> = {
  open: '開放中',
  seasonal: '季節性開放',
  maintenance: '維修中',
  closed: '已封閉',
};
const FIELD: Record<string, string> = { hours: '開放時間', surface: '地面材質', status: '狀態' };

export interface HistoryText {
  item: string;
  from: string;
  to: string;
  by: string;
}

type Lookup = (id: string | null | undefined) => string | null;

/** 「值（來源）」；沒有值是「沒有資料」 */
function withSource(value: string | null, source: string | null, label: Lookup): string {
  if (value === null || value === '') return '沒有資料';
  const s = label(source);
  return s ? `${value}（${s}）` : value;
}

/** 修改者：匯入腳本（changed_by 是 NULL）顯示「匯入」，找不到暱稱時顯示「已刪除的帳號」 */
export function changedBy(id: string | null, names: ReadonlyMap<string, string>): string {
  if (!id) return '匯入';
  return names.get(id) ?? '已刪除的帳號';
}

export function attributeHistoryText(
  h: {
    key: string;
    old_value: string | null;
    new_value: string | null;
    old_source: string | null;
    new_source: string | null;
    changed_by: string | null;
  },
  labels: Readonly<Record<string, string>>,
  source: Lookup,
  names: ReadonlyMap<string, string>,
): HistoryText {
  const tri = (v: string | null) => (v === null ? null : (TRI[v.trim()] ?? v));
  return {
    item: labels[h.key] ?? h.key,
    from: withSource(tri(h.old_value), h.old_source, source),
    to: withSource(tri(h.new_value), h.new_source, source),
    by: changedBy(h.changed_by, names),
  };
}

export function fieldHistoryText(
  h: {
    field: string;
    old_value: string | null;
    new_value: string | null;
    old_source: string | null;
    new_source: string | null;
    old_until: string | null;
    new_until: string | null;
    changed_by: string | null;
  },
  source: Lookup,
  names: ReadonlyMap<string, string>,
): HistoryText {
  const status = h.field === 'status';
  const show = (v: string | null, until: string | null) => {
    if (!status || v === null) return v;
    return `${STATUS[v] ?? v}${until ? `（預計 ${until} 恢復）` : ''}`;
  };
  return {
    item: FIELD[h.field] ?? h.field,
    from: withSource(show(h.old_value, h.old_until), h.old_source, source),
    to: withSource(show(h.new_value, h.new_until), h.new_source, source),
    by: changedBy(h.changed_by, names),
  };
}

const ROLE: Record<string, string> = {
  member: '會員',
  trusted: '資深貢獻者',
  moderator: '審核員',
  admin: '管理員',
};
export const roleLabel = (r: string) => ROLE[r] ?? r;

/** 管理員操作紀錄的一行說明 */
export function adminLogText(
  action: string,
  before: unknown,
  after: unknown,
  cityName: (code: string) => string,
): string {
  const o = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const cities = (v: unknown) =>
    Array.isArray(v) && v.length ? v.map((c) => cityName(String(c))).join('、') : '無';
  switch (action) {
    case 'set_role':
      return `角色：${roleLabel(String(o(before).role))} → ${roleLabel(String(o(after).role))}`;
    case 'set_cities':
      return `負責縣市：${cities(o(before).cities)} → ${cities(o(after).cities)}`;
    case 'ban':
      return `停權：${String(o(after).reason ?? '')}`;
    case 'unban':
      return '解除停權';
    default:
      return action;
  }
}

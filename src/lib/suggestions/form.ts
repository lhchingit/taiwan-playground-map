// 回報修正的表單 → edit_suggestions 的 kind 與 payload（純函式，不依賴 React，有單元測試）。
// 資料庫的 validate_suggestion() 仍然是最後一道檢查；這裡負責給使用者看得懂的錯誤訊息。
import type { ParkingFee, ParkingType } from '@/types/place';

export type SuggestionKind = 'attribute' | 'parking' | 'field' | 'closure';

export const SUGGESTION_KINDS: readonly { kind: SuggestionKind; label: string }[] = [
  { kind: 'attribute', label: '設施或生活機能' },
  { kind: 'parking', label: '停車' },
  { kind: 'field', label: '基本資料' },
  { kind: 'closure', label: '封閉或維修' },
];

/** 可以回報的基本資料欄位（跟資料庫 validate_suggestion() 一致） */
export const FIELD_OPTIONS = [
  { field: 'hours', label: '開放時間' },
  { field: 'surface', label: '地面材質' },
] as const;

export const LIMITS = { note: 200, value: 100, reason: 200, feeNote: 100, spaces: 10000 } as const;

export type SuggestionPayload =
  | { key: string; value: 'y' | 'n'; note?: string }
  | { type: ParkingType; fee: ParkingFee; spaces: number | null; fee_note?: string; note?: string }
  | { field: string; value: string }
  | { reason: string; until: string | null };

export type ParseResult =
  { ok: true; kind: SuggestionKind; payload: SuggestionPayload } | { ok: false; error: string };

type Fields = Record<string, string | undefined>;

const text = (v: string | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');

function tooLong(v: string, max: number, name: string): string | null {
  return [...v].length > max ? `${name}最多 ${max} 個字。` : null;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** keys：這個網站有的設施與生活機能項目（attribute_defs） */
export function parseSuggestion(f: Fields, keys: readonly string[]): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error });
  const kind = f.kind as SuggestionKind;

  if (kind === 'attribute') {
    const key = text(f.key);
    if (!keys.includes(key)) return fail('請選擇要修正的項目。');
    if (f.value !== 'y' && f.value !== 'n') return fail('請選擇「有」或「沒有」。');
    const note = text(f.note);
    const long = tooLong(note, LIMITS.note, '補充說明');
    if (long) return fail(long);
    return { ok: true, kind, payload: { key, value: f.value, ...(note && { note }) } };
  }

  if (kind === 'parking') {
    const type = f.type as ParkingType;
    if (!['lot', 'street', 'none'].includes(type)) return fail('請選擇停車的類型。');
    const fee = (f.fee || 'u') as ParkingFee;
    if (!['free', 'paid', 'u'].includes(fee)) return fail('請選擇停車費用。');
    const raw = text(f.spaces);
    if (raw && !/^\d+$/.test(raw)) return fail('停車格數要填 0 以上的整數。');
    const spaces = raw ? Number(raw) : null;
    if (spaces !== null && spaces > LIMITS.spaces) return fail('停車格數太大了，請再確認。');
    const feeNote = text(f.fee_note);
    const note = text(f.note);
    const long =
      tooLong(feeNote, LIMITS.feeNote, '費用說明') ?? tooLong(note, LIMITS.note, '補充說明');
    if (long) return fail(long);
    // 沒有停車位時，費用與格數沒有意義
    const none = type === 'none';
    return {
      ok: true,
      kind,
      payload: {
        type,
        fee: none ? 'u' : fee,
        spaces: none ? null : spaces,
        ...(!none && feeNote && { fee_note: feeNote }),
        ...(note && { note }),
      },
    };
  }

  if (kind === 'field') {
    const field = text(f.field);
    if (!FIELD_OPTIONS.some((o) => o.field === field)) return fail('請選擇要修正的欄位。');
    const value = text(f.field_value);
    if (!value) return fail('請填寫內容。');
    const long = tooLong(value, LIMITS.value, '內容');
    if (long) return fail(long);
    return { ok: true, kind, payload: { field, value } };
  }

  if (kind === 'closure') {
    const reason = text(f.reason);
    if (!reason) return fail('請填寫封閉或維修的原因。');
    const long = tooLong(reason, LIMITS.reason, '原因');
    if (long) return fail(long);
    const until = text(f.until);
    if (until && !validDate(until)) return fail('預計恢復日期的格式不對。');
    return { ok: true, kind, payload: { reason, until: until || null } };
  }

  return fail('請選擇要回報的類型。');
}

export const NEW_PLACE_LIMITS = { name: 50, address: 100, note: 200 } as const;

export interface NewPlacePayload {
  name: string;
  lat: number;
  lng: number;
  city: string;
  address?: string;
  note?: string;
}

/** 回報新場地的表單 → new_place 的 payload。city：依位置判斷出的已上線縣市（沒有時是 null） */
export function parseNewPlace(
  f: Fields,
  city: string | null,
): { ok: true; payload: NewPlacePayload } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  if (!f.lat || !f.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail('請在地圖上點出場地的位置。');
  }
  if (!city) return fail('這個位置不在目前開放的縣市。');
  const name = text(f.name);
  if (!name) return fail('請填寫場地名稱。');
  const address = text(f.address);
  const note = text(f.note);
  const long =
    tooLong(name, NEW_PLACE_LIMITS.name, '場地名稱') ??
    tooLong(address, NEW_PLACE_LIMITS.address, '地址') ??
    tooLong(note, NEW_PLACE_LIMITS.note, '補充說明');
  if (long) return fail(long);
  return {
    ok: true,
    payload: {
      name,
      // 7 位小數約 1 公分，足夠且不洩漏多餘的精度
      lat: Math.round(lat * 1e7) / 1e7,
      lng: Math.round(lng * 1e7) / 1e7,
      city,
      ...(address && { address }),
      ...(note && { note }),
    },
  };
}

/** 資料庫錯誤 → 給使用者的訊息 */
export function submitErrorMessage(err: { code?: string; message?: string }): string {
  if (err.code === '23505') return '你已經回報過，正在審核中。';
  if (err.message?.includes('今天的回報次數已達上限')) return '今天的回報次數已達上限，明天再試。';
  if (err.code === '42501') return '目前不能回報：帳號可能已停權，或還沒同意服務條款。';
  return '修正建議沒有送出，請稍後再試。';
}

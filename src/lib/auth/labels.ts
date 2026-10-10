// 「我的貢獻」頁的中文用字（純函式，有單元測試）
import type { Json } from '@/types/database';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  pending: '審核中',
  accepted: '已採納',
  rejected: '未採納',
};

/** 退回原因（對應 edit_suggestions.reject_reason 的 CHECK） */
export const REJECT_REASON_LABEL: Record<string, string> = {
  duplicate: '重複',
  unverifiable: '無法查證',
  inappropriate: '不當內容',
  outdated: '資訊過時',
  other: '其他',
};

export const KIND_LABEL: Record<string, string> = {
  attribute: '設施或生活機能',
  parking: '停車',
  field: '基本資料',
  closure: '封閉或維修',
  new_place: '新增場地',
};

const VALUE_LABEL: Record<string, string> = { y: '有', n: '沒有', u: '不確定' };
const FIELD_LABEL: Record<string, string> = { hours: '開放時間', surface: '地面材質' };
const PARKING_TYPE: Record<string, string> = {
  lot: '停車場',
  street: '路邊停車',
  none: '沒有停車位',
  u: '不確定',
};

function str(o: Record<string, Json | undefined>, k: string): string {
  const v = o[k];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** 建議內容的一行摘要；labels 是屬性 key → 中文（例：footwash → 洗腳池） */
export function suggestionSummary(
  kind: string,
  payload: Json,
  labels: Record<string, string> = {},
): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const p = payload as Record<string, Json | undefined>;
  switch (kind) {
    case 'attribute': {
      const key = str(p, 'key');
      return `${labels[key] ?? key}：${VALUE_LABEL[str(p, 'value')] ?? str(p, 'value')}`;
    }
    case 'parking': {
      const spaces = str(p, 'spaces');
      return [PARKING_TYPE[str(p, 'type')] ?? str(p, 'type'), spaces && `${spaces} 格`]
        .filter(Boolean)
        .join('，');
    }
    case 'field': {
      const field = str(p, 'field');
      return `${FIELD_LABEL[field] ?? field}：${str(p, 'value')}`;
    }
    case 'closure': {
      const until = str(p, 'until');
      return [str(p, 'reason'), until && `預計 ${until} 恢復`].filter(Boolean).join('，');
    }
    case 'new_place':
      return str(p, 'name');
    default:
      return '';
  }
}

/** 狀態的完整說明：未採納時附上原因 */
export function statusText(status: string, rejectReason: string | null): string {
  const label = STATUS_LABEL[status as SuggestionStatus] ?? status;
  if (status !== 'rejected' || !rejectReason) return label;
  return `${label}（${REJECT_REASON_LABEL[rejectReason] ?? rejectReason}）`;
}

// 人工處理結果檔 data/raw/<縣市>/manual-review.tsv 的讀寫與檢查。
// 格式與檢查規則跟 scripts/lib/manual.py 相同（兩邊都用 tests/fixtures/manual-review-sample.tsv 測試）。

export const COLUMNS = [
  '清冊編號',
  '狀態',
  '緯度',
  '經度',
  '定位依據',
  '對應編號',
  '說明',
  '定位者',
  '日期',
] as const;

export type Status =
  'located' | 'confirmed' | 'not_found' | 'abolished' | 'pending_visit' | 'duplicate';

export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  located: '已人工定位',
  confirmed: '已確認比對正確',
  not_found: '找不到',
  abolished: '已廢除',
  pending_visit: '待實地確認',
  duplicate: '重複',
};

/** 定位依據只能是這三種（CLAUDE.md：不可以用 Google 地圖查座標） */
export const BASES = ['實地確認', 'OSM 地圖上可見的公園範圍', '政府公告的地址'] as const;

export interface ReviewEntry {
  no: string;
  status: Status;
  lat: number | null;
  lng: number | null;
  basis: string;
  ref: string;
  note: string;
  by: string;
  date: string;
}

const TW = { lat: [21.5, 26.5], lng: [118, 122.5] } as const;
const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

export function validateEntry(e: ReviewEntry): string[] {
  const errors: string[] = [];
  if (!/^\d+$/.test(e.no)) errors.push(`清冊編號不是數字：${e.no}`);
  if (!(e.status in STATUS_LABEL)) errors.push(`狀態不正確：${e.status}`);
  if (e.status === 'located') {
    if (e.lat === null || e.lng === null) errors.push('已定位但沒有座標（在地圖上點選位置）');
    else if (e.lat < TW.lat[0] || e.lat > TW.lat[1] || e.lng < TW.lng[0] || e.lng > TW.lng[1])
      errors.push('座標不在台灣範圍內');
    if (!(BASES as readonly string[]).includes(e.basis))
      errors.push(`定位依據要是：${BASES.join('、')}`);
  }
  if (e.status === 'duplicate' && !/^\d+$/.test(e.ref)) errors.push('重複要填對應的清冊編號');
  if (e.status === 'duplicate' && e.ref === e.no) errors.push('不能跟自己重複');
  if (!e.by.trim()) errors.push('沒有填定位者');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push('日期格式要是 YYYY-MM-DD');
  return errors;
}

export function parseReviewFile(text: string): ReviewEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const [header, ...rows] = lines;
  if (header && header.split('\t').join('|') !== COLUMNS.join('|')) {
    throw new Error(`manual-review.tsv 的欄位不對，應該是：${COLUMNS.join('、')}`);
  }
  return rows.map((line) => {
    const c = line.split('\t');
    const num = (s: string | undefined) => (s ? Number(s) : null);
    return {
      no: c[0] ?? '',
      status: (c[1] ?? '') as Status,
      lat: num(c[2]),
      lng: num(c[3]),
      basis: c[4] ?? '',
      ref: c[5] ?? '',
      note: c[6] ?? '',
      by: c[7] ?? '',
      date: c[8] ?? '',
    };
  });
}

/** 依清冊編號排序、LF 換行，diff 好讀 */
export function serializeReviewFile(entries: readonly ReviewEntry[]): string {
  const sorted = [...entries].sort((a, b) => Number(a.no) - Number(b.no));
  const rows = sorted.map((e) =>
    [
      e.no,
      e.status,
      e.status === 'located' ? String(e.lat) : '',
      e.status === 'located' ? String(e.lng) : '',
      e.status === 'located' ? e.basis : '',
      e.status === 'duplicate' ? e.ref : '',
      clean(e.note),
      clean(e.by),
      e.date,
    ].join('\t'),
  );
  return [COLUMNS.join('\t'), ...rows].join('\n') + '\n';
}

/** 新增或取代同一個清冊編號的結果 */
export function upsertEntry(entries: readonly ReviewEntry[], entry: ReviewEntry): ReviewEntry[] {
  return [...entries.filter((e) => e.no !== entry.no), entry];
}

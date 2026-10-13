// 人工命名結果檔 data/raw/<縣市>/manual-names.tsv 的讀寫與檢查。
// 格式跟 Python 端相同：OSM 遊戲場用 scripts/sources/osm_playgrounds.py 的 MANUAL_COLUMNS（鍵是 OSM），
// 臺北市用 scripts/sources/pkl.py 的 MANUAL_COLUMNS（鍵是編號）。兩邊都用 tests/fixtures/manual-names-sample.tsv 測試。

export type KeyColumn = 'OSM' | '編號';
export const columns = (key: KeyColumn) => [key, '名稱', '依據', '確認者', '日期'] as const;

/** 排除（不上地圖）：名稱欄寫這個（osm_playgrounds.EXCLUDE） */
export const EXCLUDE = '（排除）';
/** 命名的依據只能是這三種（decisions D20；不可以用 Google 地圖查名稱） */
export const BASES = ['OSM 地圖上可見的名稱', '實地確認', '政府公告'] as const;
/** 排除的理由 */
export const EXCLUDE_REASONS = ['OSM 標錯／不是遊戲場', '私人社區', '與官方場地是同一處'] as const;

export interface NameEntry {
  key: string;
  name: string;
  basis: string;
  by: string;
  date: string;
}

const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

export function parseNamesFile(text: string): NameEntry[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  return lines.slice(1).map((l) => {
    const [key = '', name = '', basis = '', by = '', date = ''] = l.split('\t');
    return {
      key: key.trim(),
      name: name.trim(),
      basis: basis.trim(),
      by: by.trim(),
      date: date.trim(),
    };
  });
}

export function serializeNamesFile(entries: readonly NameEntry[], key: KeyColumn): string {
  const rows = entries.map((e) => [e.key, e.name, e.basis, e.by, e.date].map(clean).join('\t'));
  return [columns(key).join('\t'), ...rows].join('\n') + '\n';
}

/** 同一個鍵只留最新的一筆，其他順序不變 */
export function upsertName(entries: readonly NameEntry[], entry: NameEntry): NameEntry[] {
  const i = entries.findIndex((e) => e.key === entry.key);
  if (i < 0) return [...entries, entry];
  return entries.map((e, j) => (j === i ? entry : e));
}

export function validateName(e: NameEntry, opts: { allowExclude: boolean }): string[] {
  const errors: string[] = [];
  if (!e.key) errors.push('沒有指定是哪一處');
  if (e.name === EXCLUDE) {
    if (!opts.allowExclude) errors.push('這個縣市只能命名或跳過，不能排除');
    if (!(EXCLUDE_REASONS as readonly string[]).includes(e.basis))
      errors.push(`排除的理由要是：${EXCLUDE_REASONS.join('、')}`);
  } else {
    if (!e.name) errors.push('沒有填名稱');
    if ([...e.name].length > 40) errors.push('名稱最多 40 字');
    if (/https?:|www\.|\.com|google/i.test(e.name)) errors.push('名稱不能是網址');
    if (!(BASES as readonly string[]).includes(e.basis))
      errors.push(`命名依據要是：${BASES.join('、')}（不可以用 Google 地圖查名稱）`);
  }
  if (!e.by) errors.push('沒有填確認者');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push('日期格式要是 YYYY-MM-DD');
  return errors;
}

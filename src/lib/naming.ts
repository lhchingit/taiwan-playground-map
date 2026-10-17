// 會員命名（decisions D23）的規則：跟資料庫 check_naming()、naming_key() 一致（純函式，有單元測試）。
// 資料庫仍然是最後一道檢查；這裡負責給使用者看得懂的錯誤訊息。

/** 命名的依據只能是這三種（decisions D20；不可以用 Google 地圖查名稱） */
export const NAMING_BASES = ['OSM 地圖上可見的名稱', '實地確認', '政府公告'] as const;
/** 網站上可以選的排除理由（「與官方場地是同一處」只在本機工具判斷） */
export const NAMING_EXCLUDE_REASONS = [
  'OSM 標錯／不是遊戲場',
  '私人社區',
  '在學校或機關內',
] as const;
export const NAMING_NAME_MAX = 40;

export type NamingAction = 'name' | 'exclude';

/** 比對用的名稱：全形半形視為相同（NFKC）、去掉空白、小寫 */
export function namingKey(name: string): string {
  return name.trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** 檢查一票；回傳錯誤訊息，沒問題時回傳 null */
export function checkNamingVote(action: string, name: string, basis: string): string | null {
  if (action === 'name') {
    const n = name.trim();
    if (!n) return '請填名稱。';
    if ([...n].length > NAMING_NAME_MAX) return `名稱最多 ${NAMING_NAME_MAX} 字。`;
    if (/https?:|www\.|\.com|google/i.test(n)) return '名稱不能是網址。';
    if (!(NAMING_BASES as readonly string[]).includes(basis)) {
      return '請選擇命名依據（不可以用 Google 地圖查名稱）。';
    }
    return null;
  }
  if (action === 'exclude') {
    return (NAMING_EXCLUDE_REASONS as readonly string[]).includes(basis)
      ? null
      : '請選擇排除的理由。';
  }
  return '請選擇要命名還是排除。';
}

/** 資料庫的錯誤訊息（RAISE EXCEPTION 的中文）→ 給使用者看的訊息 */
export function namingErrorMessage(message: string): string {
  if (/上限/.test(message)) return '今天的命名次數已達上限，明天再試。';
  if (/已經處理過|已經有名稱/.test(message)) return '這一處剛剛已經有結果了，請重新整理。';
  if (/服務條款/.test(message)) return '請先勾選同意服務條款。';
  if (/登入|停權/.test(message)) return '請先登入（或帳號已停權）。';
  if (/\p{Script=Han}/u.test(message)) return message; // 資料庫的檢查訊息本來就是中文
  return '送出失敗，請稍後再試。';
}

/** 網站名稱與說明（頁面標題、PWA manifest 共用） */
export const SITE_NAME = '全台放電地圖';
/** 加到主畫面時圖示下方的名稱（6 個字在部分手機會被截斷） */
export const SHORT_NAME = '放電地圖';
export const SITE_DESCRIPTION =
  '台灣親子遊樂場與公園地圖：依遊樂設施、年齡、生活機能、停車與距離篩選。';

/** 網站的正式網址（canonical、sitemap、JSON-LD 用）。上線時設定 SITE_URL。 */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

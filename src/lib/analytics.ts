// Vercel Web Analytics 送出前的網址處理（decisions D30）。純函式。
// 首頁與縣市頁保留篩選參數（只有篩選條件，出發點不在網址裡）；其他頁面拿掉參數，
// 例如管理後台用 Email 搜尋使用者（/admin/users?q=）、登入頁的 next。

/** app 底下固定的第一層路徑；其餘單層路徑是縣市頁（/[city]） */
const TOP_LEVEL = new Set([
  'admin',
  'auth',
  'api',
  'login',
  'me',
  'privacy',
  'terms',
  'report',
  'saved-filters',
]);

export function analyticsUrl(url: string): string {
  const u = new URL(url);
  const segments = u.pathname.split('/').filter(Boolean);
  const keepQuery =
    segments.length === 0 || (segments.length === 1 && !TOP_LEVEL.has(segments[0]!));
  if (!keepQuery) u.search = '';
  u.hash = '';
  return u.toString();
}

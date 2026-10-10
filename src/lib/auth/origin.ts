// 這次請求的網站來源（例：http://localhost:3100、https://example.tw）。
// 登入完成要回到「發起登入的同一個網站」：PKCE 的驗證碼存在這個網站的 cookie。
// 偽造 Host 也沒用：導回網址必須在 Supabase 的 Redirect URLs 允許清單裡，否則 Supabase 會改用 Site URL。
import { headers } from 'next/headers';

export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

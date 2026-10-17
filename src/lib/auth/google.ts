// Google 登入（Google Identity Services，decisions D28）。網站自己顯示 Google 的登入按鈕，Google 直接把 ID token
// 交給網站，再由伺服器換成 Supabase 的 session，Google 的畫面因此顯示網站網址，而不是 Supabase 的網域。
// 沒設定 GOOGLE_CLIENT_ID 時，維持原本經過 Supabase 轉址的登入流程（本機、CI、Docker）。

/** Google OAuth 用戶端 ID（公開值，跟 Supabase 後台 Google provider 的相同）；沒設定時是 null */
export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID || null;
}

const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const NONCE = /^[0-9a-f]{64}$/;

/** ID token 與 nonce 的格式檢查（在送去 Supabase 驗證之前先擋掉明顯不對的輸入） */
export function validIdTokenInput(credential: unknown, nonce: unknown): boolean {
  return (
    typeof credential === 'string' &&
    credential.length <= 8192 &&
    JWT.test(credential) &&
    typeof nonce === 'string' &&
    NONCE.test(nonce)
  );
}

/** 隨機 nonce（32 bytes，十六進位 64 字元）。原始值給 Supabase，SHA-256 雜湊給 Google */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256（十六進位小寫），Google 的 nonce 參數用 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Cloudflare Turnstile：送出修正建議前確認不是機器人。
// 沒有設定金鑰時拒絕提交（fail closed），不會略過驗證。本機與 CI 用 Cloudflare 官方的測試金鑰（pnpm env:local）。

/** 公開的 site key（給瀏覽器）；沒設定時是 null */
export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 驗證瀏覽器拿到的 token。ip 只用來送給 Cloudflare 驗證，不記錄。 */
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch(VERIFY, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

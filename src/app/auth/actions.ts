'use server';
// 登入（Google、Email 登入連結）。流程全部在伺服器端，session 存在 httpOnly cookie。
import { redirect } from 'next/navigation';
import { validIdTokenInput } from '@/lib/auth/google';
import { safeNext } from '@/lib/auth/next-path';
import { requestOrigin } from '@/lib/auth/origin';
import { toPublicUrl } from '@/lib/auth/public-url';
import { supabaseAuth } from '@/lib/supabase/auth';
import { supabaseEnv, supabasePublicUrl } from '@/lib/supabase/env';

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get('next')?.toString());
  const origin = await requestOrigin();
  const { data, error } = await (
    await supabaseAuth()
  ).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  redirect(toPublicUrl(data.url, supabaseEnv().url, supabasePublicUrl()));
}

/**
 * Google Identity Services 的登入（decisions D28）：瀏覽器拿到 Google 的 ID token 後交給這裡，
 * 由 Supabase 驗證簽章、audience 與 nonce，成功就寫入 session cookie。token 不記錄。
 */
export async function signInWithGoogleIdToken(
  credential: string,
  nonce: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const failed = { ok: false as const, message: '登入沒有成功，請再試一次。' };
  if (!validIdTokenInput(credential, nonce)) return failed;
  const { error } = await (
    await supabaseAuth()
  ).auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
  return error ? failed : { ok: true };
}

export interface MagicLinkState {
  status: 'idle' | 'sent' | 'error';
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = formData.get('email')?.toString().trim() ?? '';
  const next = safeNext(formData.get('next')?.toString());
  if (!EMAIL.test(email) || email.length > 254) {
    return { status: 'error', message: '請輸入正確的 Email。' };
  }
  const origin = await requestOrigin();
  const { error } = await (
    await supabaseAuth()
  ).auth.signInWithOtp({
    email,
    options: {
      // 信裡的連結是 {{ .RedirectTo }}&token_hash=…（supabase/templates/magic_link.html），
      // 在伺服器端驗證，換別的瀏覽器或裝置打開也能登入
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    const tooMany = error.status === 429 || /rate limit|security purposes/i.test(error.message);
    return {
      status: 'error',
      message: tooMany ? '寄信太頻繁了，請稍等一下再試。' : '登入連結沒有寄出，請稍後再試。',
    };
  }
  return { status: 'sent', message: `登入連結已寄到 ${email}，請在 1 小時內打開信裡的連結。` };
}

// Email 登入連結：在伺服器端驗證 token_hash 建立 session，再回到原本的頁面。
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/next-path';
import { requestOrigin } from '@/lib/auth/origin';
import { supabaseAuth } from '@/lib/supabase/auth';

const TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup'];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const next = safeNext(q.get('next'));
  const origin = await requestOrigin();
  const tokenHash = q.get('token_hash');
  const type = q.get('type') as EmailOtpType | null;
  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await (await supabaseAuth()).auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`, { status: 303 });
  }
  return NextResponse.redirect(`${origin}/login?error=1&next=${encodeURIComponent(next)}`, {
    status: 303,
  });
}

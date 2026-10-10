// Google 登入完成後回到這裡：用授權碼換 session（PKCE），再回到原本的頁面。
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/next-path';
import { requestOrigin } from '@/lib/auth/origin';
import { supabaseAuth } from '@/lib/supabase/auth';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const next = safeNext(q.get('next'));
  const origin = await requestOrigin();
  const code = q.get('code');
  if (code) {
    const { error } = await (await supabaseAuth()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`, { status: 303 });
  }
  return NextResponse.redirect(`${origin}/login?error=1&next=${encodeURIComponent(next)}`, {
    status: 303,
  });
}

// 登出（只接受本站送出的 POST，避免被別的網站用連結、圖片或表單觸發）。清掉 session cookie 後回到原本的頁面。
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/next-path';
import { requestOrigin } from '@/lib/auth/origin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { supabaseAuth } from '@/lib/supabase/auth';

export async function POST(request: NextRequest) {
  const origin = await requestOrigin();
  if (!(await isSameOrigin(request))) return NextResponse.redirect(`${origin}/`, { status: 303 });
  const form = await request.formData();
  const next = safeNext(form.get('next')?.toString());
  await (await supabaseAuth()).auth.signOut({ scope: 'local' });
  return NextResponse.redirect(`${origin}${next}`, { status: 303 });
}

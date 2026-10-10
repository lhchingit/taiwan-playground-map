// 刪除帳號（「我的貢獻」頁的表單 POST 到這裡）。用整頁導向回首頁：頁首重新確認登入狀態，
// 也不會在刪除後又重新整理需要登入的 /me。只能刪除自己（資料庫函式 delete_my_account()）。
import { NextResponse, type NextRequest } from 'next/server';
import { requestOrigin } from '@/lib/auth/origin';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { supabaseAuth } from '@/lib/supabase/auth';

export async function POST(request: NextRequest) {
  const origin = await requestOrigin();
  const back = (reason: string) =>
    NextResponse.redirect(`${origin}/me?delete_error=${reason}`, { status: 303 });
  if (!(await isSameOrigin(request))) return back('origin');

  const form = await request.formData();
  if (form.get('confirm')?.toString().trim() !== '刪除') return back('confirm');

  const supabase = await supabaseAuth();
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return back('failed');
  // 帳號已經不存在，只清掉這個瀏覽器的 session cookie
  await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}

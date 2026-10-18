'use server';
// 「我的貢獻」頁的操作：改暱稱、撤回待審建議（經過 RLS／資料庫函式，不使用 service role key）。刪除帳號在 /auth/delete-account。
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAuth } from '@/lib/supabase/auth';

export interface FormState {
  status: 'idle' | 'ok' | 'error';
  message: string;
}

export async function updateNickname(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = (formData.get('name')?.toString() ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || [...name].length > 30) {
    return { status: 'error', message: '暱稱要 1～30 個字。' };
  }
  const supabase = await supabaseAuth();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) redirect('/login?next=/me');
  // 被停權時 RLS 不允許修改：更新不到任何一列
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', id)
    .select('id');
  if (error || !data?.length) return { status: 'error', message: '暱稱沒有改成功。' };
  revalidatePath('/me');
  return { status: 'ok', message: '已更新暱稱。' };
}

/**
 * 撤回自己還沒審核的修正建議（decisions D29）。權限在資料庫：withdraw_suggestion() 只接受本人的 pending 建議。
 * 「我的貢獻」與場地頁重複回報時共用。
 */
export async function withdrawSuggestion(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, message: '找不到這筆建議。' };
  const supabase = await supabaseAuth();
  const { error } = await supabase.rpc('withdraw_suggestion', { p_id: id });
  if (error) return { ok: false, message: '這筆建議已經審核或撤回了。' };
  revalidatePath('/me');
  revalidatePath('/admin');
  return { ok: true };
}

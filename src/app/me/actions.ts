'use server';
// 「我的貢獻」頁的操作：改暱稱（經過 RLS，不使用 service role key）。刪除帳號在 /auth/delete-account。
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

'use server';
// 審核員直接決定待命名點（decisions D23）：透過資料庫函式 resolve_naming()，權限（負責縣市）由資料庫把關。
// 管理員調整自動通過的門檻：admin_set_naming_threshold()。
import { revalidatePath, updateTag } from 'next/cache';
import { checkNamingVote, namingErrorMessage } from '@/lib/naming';
import { supabaseAuth } from '@/lib/supabase/auth';

export interface ResolveState {
  ok: boolean;
  message: string;
}

export async function resolveNaming(_prev: ResolveState, f: FormData): Promise<ResolveState> {
  const get = (k: string) => f.get(k)?.toString().trim() ?? '';
  const action = get('action') === 'exclude' ? 'exclude' : 'name';
  // 選了票數表裡的名稱，或自己輸入（自己輸入優先）
  const name = action === 'name' ? get('custom') || get('pick') : '';
  const basis = action === 'name' ? get('basis') : get('reason');
  const err = checkNamingVote(action, name, basis);
  if (err) return { ok: false, message: err };
  const city = get('city');

  const supabase = await supabaseAuth();
  const { error } = await supabase.rpc('resolve_naming', {
    p_candidate: get('id'),
    p_action: action,
    p_name: action === 'name' ? name : (null as unknown as string),
    p_basis: basis,
  });
  if (error) return { ok: false, message: namingErrorMessage(error.message) };
  if (/^[a-z]{3}$/.test(city)) {
    updateTag(`naming:${city}`);
    if (action === 'name') {
      updateTag(`places:${city}`);
      updateTag(`city:${city}`);
      updateTag('places');
    }
  }
  // 清快取時頁面會重新整理，這一處就從列表消失（已經決定的不再列出）
  return {
    ok: true,
    message: action === 'name' ? `已命名為「${name}」，已加到地圖上。` : '已排除。',
  };
}

export interface ThresholdState {
  ok: boolean | null;
  message: string;
}

/** 管理員調整自動通過的門檻：admin_set_naming_threshold() 檢查是不是管理員、範圍，並寫入 admin_log */
export async function setNamingThreshold(
  _prev: ThresholdState,
  f: FormData,
): Promise<ThresholdState> {
  const n = Number(f.get('threshold'));
  if (!Number.isInteger(n) || n < 2 || n > 100)
    return { ok: false, message: '門檻要是 2～100 人。' };
  const supabase = await supabaseAuth();
  const { error } = await supabase.rpc('admin_set_naming_threshold', { p_threshold: n });
  if (error) return { ok: false, message: error.message };
  // 命名頁的說明與 metadata 用到門檻
  updateTag('naming-settings');
  revalidatePath('/admin/naming');
  return { ok: true, message: `已改成 ${n} 人。` };
}

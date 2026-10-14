'use server';
// 審核員直接決定待命名點（decisions D23）：透過資料庫函式 resolve_naming()，權限（負責縣市）由資料庫把關。
import { updateTag } from 'next/cache';
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

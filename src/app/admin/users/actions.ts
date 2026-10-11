'use server';
// 使用者管理（只有管理員）：角色、負責縣市、停權。全部透過資料庫函式 admin_*()，
// 函式檢查是不是管理員、不能對自己操作，並寫入 admin_log。
import { revalidatePath } from 'next/cache';
import { supabaseAuth } from '@/lib/supabase/auth';

export interface UserActionState {
  ok: boolean | null;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function userAction(_prev: UserActionState, f: FormData): Promise<UserActionState> {
  const user = f.get('user')?.toString() ?? '';
  const name = f.get('name')?.toString() ?? '這個使用者';
  if (!UUID.test(user)) return { ok: false, message: '找不到這個使用者' };
  const supabase = await supabaseAuth();
  const op = f.get('op');
  let res: { error: { message: string } | null };
  let done: string;
  if (op === 'role') {
    const role = f.get('role')?.toString() ?? '';
    res = await supabase.rpc('admin_set_role', { p_user: user, p_role: role });
    done = `已更新${name}的角色`;
  } else if (op === 'cities') {
    const cities = f.getAll('cities').map(String);
    res = await supabase.rpc('admin_set_cities', { p_user: user, p_cities: cities });
    done = `已更新${name}的負責縣市`;
  } else if (op === 'ban') {
    const reason = f.get('reason')?.toString() ?? '';
    res = await supabase.rpc('admin_ban', { p_user: user, p_reason: reason });
    done = `已停權${name}`;
  } else if (op === 'unban') {
    res = await supabase.rpc('admin_unban', { p_user: user });
    done = `已解除${name}的停權`;
  } else {
    return { ok: false, message: '不支援的操作' };
  }
  if (res.error) return { ok: false, message: res.error.message };
  revalidatePath('/admin/users');
  return { ok: true, message: done };
}

// 目前登入的使用者（只有對外可以顯示的欄位：暱稱、角色、是否停權）。不回傳 email、登入方式。
import type { AuthClient } from '@/lib/supabase/auth';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  /** 是否已同意服務條款（第一次提交前要同意） */
  termsAccepted: boolean;
}

export async function currentUser(supabase: AuthClient): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: p } = await supabase
    .from('profiles')
    .select('display_name, role, banned_at, ban_reason, terms_accepted_at')
    .eq('id', id)
    .maybeSingle();
  if (!p) return null;
  return {
    id,
    name: p.display_name ?? '家長',
    role: p.role,
    banned: p.banned_at !== null,
    banReason: p.ban_reason,
    termsAccepted: p.terms_accepted_at !== null,
  };
}

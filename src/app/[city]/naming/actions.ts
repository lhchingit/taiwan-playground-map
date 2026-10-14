'use server';
// 會員命名（decisions D23）：以登入身分呼叫資料庫的 vote_naming()，權限與計票都在資料庫。
// 不使用 service role key；不用 Turnstile（一筆一筆驗證太麻煩），靠登入與每天上限防濫用。
// 3 人一致時資料庫立刻建立場地：清除那個縣市的快取，地圖下一個請求就有這處場地。
import { updateTag } from 'next/cache';
import { checkNamingVote, namingErrorMessage, type NamingAction } from '@/lib/naming';
import { supabaseAuth } from '@/lib/supabase/auth';

export interface NamingVoteResult {
  status: 'voted' | 'named' | 'excluded' | 'error';
  message: string;
}

export interface MyNamingVote {
  candidateId: string;
  action: NamingAction;
  name: string | null;
  basis: string;
}

const fail = (message: string): NamingVoteResult => ({ status: 'error', message });

export async function voteNaming(input: {
  city: string;
  candidateId: string;
  action: NamingAction;
  name: string;
  basis: string;
  agree: boolean;
}): Promise<NamingVoteResult> {
  const err = checkNamingVote(input.action, input.name, input.basis);
  if (err) return fail(err);
  if (!/^[a-z]{3}$/.test(input.city) || !/^[a-z0-9-]{1,80}$/.test(input.candidateId)) {
    return fail('找不到這一處。');
  }

  const supabase = await supabaseAuth();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return fail('請先登入。');

  // 第一次參與：同意服務條款（時間由資料庫設成伺服器時間），跟回報修正相同
  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return fail('請先登入。');
  if (!profile.terms_accepted_at) {
    if (!input.agree) return fail('第一次參與前，請先勾選同意服務條款。');
    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return fail('目前不能參與：帳號可能已停權。');
  }

  const { data, error } = await supabase.rpc('vote_naming', {
    p_candidate: input.candidateId,
    p_action: input.action,
    p_name: input.action === 'name' ? input.name.trim() : (null as unknown as string),
    p_basis: input.basis,
  });
  if (error) return fail(namingErrorMessage(error.message));

  updateTag(`naming:${input.city}`);
  if (data === 'named') {
    updateTag(`places:${input.city}`);
    updateTag(`city:${input.city}`);
    updateTag('places');
    return { status: 'named', message: '已經有 3 人提出相同名稱，這處已加到地圖上。謝謝！' };
  }
  if (data === 'excluded') {
    return { status: 'excluded', message: '已經有 3 人建議排除，這處不會上地圖。謝謝！' };
  }
  return { status: 'voted', message: '已記錄。有 3 人提出相同名稱就會加到地圖上。' };
}

/** 自己在這個縣市投過的票（只有自己看得到，RLS 把關） */
export async function myNamingVotes(city: string): Promise<MyNamingVote[]> {
  if (!/^[a-z]{3}$/.test(city)) return [];
  const supabase = await supabaseAuth();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];
  const { data } = await supabase
    .from('naming_votes')
    .select('candidate_id, action, name, basis, naming_candidates!inner(city)')
    .eq('user_id', userId)
    .eq('naming_candidates.city', city);
  return (data ?? []).map((v) => ({
    candidateId: v.candidate_id,
    action: v.action as NamingAction,
    name: v.name,
    basis: v.basis,
  }));
}

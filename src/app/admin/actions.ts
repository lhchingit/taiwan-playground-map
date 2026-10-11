'use server';
// 審核後台的操作：核准／退回（可批次）、恢復開放。全部透過資料庫函式 review_suggestion()、reopen_place()，
// 權限由資料庫把關（負責縣市、不能審核自己的建議）；不使用 service role key、不直接寫場地資料表（decisions D15）。
// 套用成功後清除那個場地與縣市的快取，場地頁、首頁清單的下一個請求就是新資料。
import { revalidatePath, updateTag } from 'next/cache';
import type { Json } from '@/types/database';
import { supabaseAuth, type AuthClient } from '@/lib/supabase/auth';

const REASONS = ['duplicate', 'unverifiable', 'inappropriate', 'outdated', 'other'] as const;

export interface ReviewResult {
  id: number;
  ok: boolean;
  message: string;
}

export interface ReviewState {
  results: ReviewResult[];
}

async function placeCity(supabase: AuthClient, placeId: string | null): Promise<string | null> {
  if (!placeId) return null;
  const { data } = await supabase.from('places').select('city').eq('id', placeId).maybeSingle();
  return data?.city ?? null;
}

function expirePlace(placeId: string, city: string | null) {
  updateTag(`place:${placeId}`);
  if (city) {
    updateTag(`places:${city}`);
    updateTag(`city:${city}`);
  }
}

/** 核准時審核員修改過的內容（基本資料、封閉或維修）；沒有修改就用原本的建議 */
function editedPayload(kind: string, f: FormData): Json | undefined {
  const get = (k: string) => f.get(k)?.toString().trim() ?? '';
  if (kind === 'field' && f.has('edit_value')) {
    return { field: get('edit_field'), value: get('edit_value') };
  }
  if (kind === 'closure' && f.has('edit_reason')) {
    return {
      reason: get('edit_reason'),
      until: get('edit_until') || null,
      status: get('edit_status') === 'closed' ? 'closed' : 'maintenance',
    };
  }
  return undefined;
}

async function reviewOne(
  supabase: AuthClient,
  id: number,
  accept: boolean,
  reason: string | null,
  note: string | null,
  payload: Json | undefined,
): Promise<ReviewResult> {
  const { data: s } = await supabase
    .from('edit_suggestions')
    .select('place_id')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.rpc('review_suggestion', {
    p_id: id,
    p_accept: accept,
    p_reason: reason ?? undefined,
    p_note: note ?? undefined,
    p_payload: payload,
  });
  if (error) return { id, ok: false, message: error.message };
  if (accept && s?.place_id) expirePlace(s.place_id, await placeCity(supabase, s.place_id));
  return { id, ok: true, message: accept ? '已核准並套用' : '已退回' };
}

function parseDecision(f: FormData) {
  const accept = f.get('decision') === 'accept';
  const r = f.get('reason')?.toString() ?? 'other';
  const reason = accept ? null : (REASONS as readonly string[]).includes(r) ? r : 'other';
  const note = f.get('review_note')?.toString().trim().slice(0, 500) || null;
  return { accept, reason, note };
}

/** 單筆審核（對照畫面的表單） */
export async function reviewSuggestion(_prev: ReviewState, f: FormData): Promise<ReviewState> {
  const id = Number(f.get('id'));
  if (!Number.isInteger(id)) return { results: [{ id: 0, ok: false, message: '找不到這筆建議' }] };
  const { accept, reason, note } = parseDecision(f);
  const kind = f.get('kind')?.toString() ?? '';
  const supabase = await supabaseAuth();
  const result = await reviewOne(
    supabase,
    id,
    accept,
    reason,
    note,
    accept ? editedPayload(kind, f) : undefined,
  );
  // 不重新整理清單：卡片留著顯示結果，重新整理頁面後才從待審清單移除
  return { results: [result] };
}

/** 批次：勾選的每一筆各自一個交易，結果逐筆回報 */
export async function reviewBatch(_prev: ReviewState, f: FormData): Promise<ReviewState> {
  const ids = f
    .getAll('ids')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n))
    .slice(0, 100);
  if (ids.length === 0) return { results: [{ id: 0, ok: false, message: '請先勾選要處理的建議' }] };
  const { accept, reason, note } = parseDecision(f);
  const supabase = await supabaseAuth();
  const results: ReviewResult[] = [];
  for (const id of ids)
    results.push(await reviewOne(supabase, id, accept, reason, note, undefined));
  revalidatePath('/admin');
  return { results };
}

/** 恢復開放（審核員確認維修結束） */
export async function reopenPlace(_prev: ReviewState, f: FormData): Promise<ReviewState> {
  const placeId = f.get('place_id')?.toString() ?? '';
  const note = f.get('note')?.toString().trim().slice(0, 200) || undefined;
  const supabase = await supabaseAuth();
  const { error } = await supabase.rpc('reopen_place', { p_place_id: placeId, p_note: note });
  if (error) return { results: [{ id: 0, ok: false, message: error.message }] };
  expirePlace(placeId, await placeCity(supabase, placeId));
  revalidatePath('/admin');
  return { results: [{ id: 0, ok: true, message: '已恢復開放' }] };
}

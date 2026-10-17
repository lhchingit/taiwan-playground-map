'use server';
// 儲存篩選條件（decisions D27）：以登入身分存取 saved_filters，權限與上限都在資料庫（RLS＋trigger）。
// 不使用 service role key。條件是分享網址的 query string，讀回來由前端用 queryToFilters() 解析。
import { checkSavedName, type SavedFilter } from '@/lib/saved-filters';
import { supabaseAuth } from '@/lib/supabase/auth';

export type SavedFiltersResult =
  { ok: true; items: SavedFilter[] } | { ok: false; message: string; items?: SavedFilter[] };

const LOGIN = '請先登入。';
const ID = /^[0-9a-f-]{36}$/;

async function list(supabase: Awaited<ReturnType<typeof supabaseAuth>>): Promise<SavedFilter[]> {
  const { data } = await supabase
    .from('saved_filters')
    .select('id, name, query')
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function signedIn() {
  const supabase = await supabaseAuth();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}

export async function listSavedFilters(): Promise<SavedFiltersResult> {
  const supabase = await signedIn();
  if (!supabase) return { ok: false, message: LOGIN };
  return { ok: true, items: await list(supabase) };
}

export async function saveFilter(name: string, query: string): Promise<SavedFiltersResult> {
  const err = checkSavedName(name);
  if (err) return { ok: false, message: err };
  if (!query || query.length > 1000) return { ok: false, message: '請先選擇篩選條件。' };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, message: LOGIN };

  const { error } = await supabase.from('saved_filters').insert({ name: name.trim(), query });
  if (error) {
    const message = /saved_filters_limit/.test(error.message)
      ? '最多 5 組，請先刪掉一組。'
      : '儲存失敗，請稍後再試。';
    return { ok: false, message, items: await list(supabase) };
  }
  return { ok: true, items: await list(supabase) };
}

export async function renameSavedFilter(id: string, name: string): Promise<SavedFiltersResult> {
  const err = checkSavedName(name);
  if (err) return { ok: false, message: err };
  if (!ID.test(id)) return { ok: false, message: '找不到這一組。' };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, message: LOGIN };

  const { error } = await supabase.from('saved_filters').update({ name: name.trim() }).eq('id', id);
  if (error) return { ok: false, message: '改名失敗，請稍後再試。', items: await list(supabase) };
  return { ok: true, items: await list(supabase) };
}

export async function deleteSavedFilter(id: string): Promise<SavedFiltersResult> {
  if (!ID.test(id)) return { ok: false, message: '找不到這一組。' };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, message: LOGIN };

  const { error } = await supabase.from('saved_filters').delete().eq('id', id);
  if (error) return { ok: false, message: '刪除失敗，請稍後再試。', items: await list(supabase) };
  return { ok: true, items: await list(supabase) };
}

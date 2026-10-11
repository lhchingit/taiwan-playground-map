'use server';
// 修改紀錄的還原：透過資料庫函式 restore_attribute()／restore_field()（檢查負責縣市、留下紀錄），
// 成功後清除那個場地與縣市的快取。
import { revalidatePath, updateTag } from 'next/cache';
import { supabaseAuth } from '@/lib/supabase/auth';

export interface RestoreState {
  ok: boolean | null;
  message: string;
}

export async function restoreHistory(_prev: RestoreState, f: FormData): Promise<RestoreState> {
  const id = Number(f.get('history_id'));
  const type = f.get('type');
  const placeId = f.get('place_id')?.toString() ?? '';
  if (
    !Number.isInteger(id) ||
    (type !== 'attribute' && type !== 'field') ||
    !/^[a-z0-9-]{1,80}$/.test(placeId)
  ) {
    return { ok: false, message: '找不到這筆修改紀錄' };
  }
  const supabase = await supabaseAuth();
  const { error } =
    type === 'attribute'
      ? await supabase.rpc('restore_attribute', { p_history_id: id })
      : await supabase.rpc('restore_field', { p_history_id: id });
  if (error) return { ok: false, message: error.message };

  const { data: place } = await supabase
    .from('places')
    .select('city')
    .eq('id', placeId)
    .maybeSingle();
  updateTag(`place:${placeId}`);
  if (place?.city) {
    updateTag(`places:${place.city}`);
    updateTag(`city:${place.city}`);
  }
  revalidatePath(`/admin/places/${placeId}`);
  return { ok: true, message: `已還原到紀錄 #${id} 之前的狀態` };
}

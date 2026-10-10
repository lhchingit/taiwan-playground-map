// 伺服器端讀取的公開資料，快取 1 小時（decisions D4）。
import { cacheLife, cacheTag } from 'next/cache';
import type { AttributeDef } from '@/types/place';
import type { CityBounds } from './cities';
import { toCatalog, toCityPlace, type AttributeCatalog, type CityPlace } from './places';
import { supabaseServer } from './supabase/server';

/** 全部縣市的範圍（含尚未上線的），前端用來判斷要載入哪些縣市 */
export async function getCityBounds(): Promise<CityBounds[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('cities');
  const { data, error } = await supabaseServer().from('city_bounds').select('*').order('code');
  if (error) throw new Error(`讀取縣市失敗：${error.message}`);
  return data.map((c) => ({
    code: c.code ?? '',
    slug: c.slug ?? '',
    name: c.name ?? '',
    bbox: c.bbox,
    launched: c.launched === true,
  }));
}

export async function getAttributeCatalog(): Promise<AttributeCatalog> {
  'use cache';
  cacheLife('hours');
  cacheTag('attribute_defs');
  const { data, error } = await supabaseServer().from('attribute_defs').select('*');
  if (error) throw new Error(`讀取屬性字典失敗：${error.message}`);
  return toCatalog(data as AttributeDef[]);
}

/** 一個縣市的場地；尚未上線的縣市因為 RLS 會是空陣列 */
export async function getCityPlaces(code: string): Promise<CityPlace[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(`places:${code}`);
  const { data, error } = await supabaseServer()
    .from('place_cards')
    .select('*')
    .eq('city', code)
    .order('id');
  if (error) throw new Error(`讀取 ${code} 的場地失敗：${error.message}`);
  return data.map((row) => toCityPlace(row));
}

// 伺服器端讀取的公開資料，快取 1 小時（decisions D4）。
import { cacheLife, cacheTag } from 'next/cache';
import type { AttributeDef } from '@/types/place';
import type { CityBounds } from './cities';
import { toPlaceDetail, type PlaceDetail, type SourceRef } from './place-detail';
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

export async function getSources(): Promise<SourceRef[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('sources');
  const { data, error } = await supabaseServer().from('sources').select('id, label, url, kind');
  if (error) throw new Error(`讀取來源失敗：${error.message}`);
  return data as SourceRef[];
}

/** 已上線縣市的全部場地網址參數（generateStaticParams、sitemap 用） */
export async function getLaunchedPlaceParams(): Promise<{ city: string; id: string }[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('places');
  const cities = (await getCityBounds()).filter((c) => c.launched);
  const lists = await Promise.all(cities.map((c) => getCityPlaces(c.code)));
  return cities.flatMap((c, i) => (lists[i] ?? []).map((p) => ({ city: c.slug, id: p.id })));
}

/** 場地詳情；不存在或縣市尚未上線（RLS 讀不到）時回傳 null */
export async function getPlaceDetail(id: string): Promise<PlaceDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(`place:${id}`);
  const sb = supabaseServer();
  const [card, place, attributes, parking, sources] = await Promise.all([
    sb.from('place_cards').select('*').eq('id', id).maybeSingle(),
    sb
      .from('places')
      .select('address, hours, surface, summary, area_ha, stay_source, coord_source')
      .eq('id', id)
      .maybeSingle(),
    sb
      .from('place_attributes')
      .select('key, value, note, verified_at, sources(id, label, url, kind)')
      .eq('place_id', id),
    sb
      .from('place_parking')
      .select(
        'type, fee, fee_note, spaces, distance_m, note, verified_at, sources(id, label, url, kind)',
      )
      .eq('place_id', id)
      .order('id'),
    getSources(),
  ]);
  for (const r of [card, place, attributes, parking]) {
    if (r.error) throw new Error(`讀取場地 ${id} 失敗：${r.error.message}`);
  }
  if (!card.data || !place.data) return null;
  return toPlaceDetail({
    card: toCityPlace(card.data),
    place: place.data,
    attributes: attributes.data ?? [],
    parking: parking.data ?? [],
    sources,
  });
}

// Supabase Auth 開了哪些登入方式（例：Google 還沒設定金鑰時不顯示可以按的按鈕）。結果快取 1 小時。
import { cacheLife } from 'next/cache';
import { supabaseEnv } from '@/lib/supabase/env';

export async function authProviders(): Promise<{ google: boolean; email: boolean }> {
  'use cache';
  cacheLife('hours');
  const { url, key } = supabaseEnv();
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const s = (await res.json()) as { external?: Record<string, boolean> };
    return { google: s.external?.google === true, email: s.external?.email !== false };
  } catch {
    return { google: false, email: true };
  }
}

// 伺服器端的 Supabase client：用 anon key，一律經過 RLS。不使用 service role key。
// 只在伺服器元件與 route handler 使用；瀏覽器不直接連 Supabase。
// 這個 client 不帶登入狀態（公開資料、可以快取）；需要登入身分的用 ./auth 的 supabaseAuth()。
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { supabaseEnv } from './env';
import { limitedFetch } from './limit';

// 同一個程序裡所有 supabaseServer() 共用的同時請求上限（建置時產生上千個場地頁也不會塞爆閘道）
const MAX_CONCURRENCY = Number(process.env.SUPABASE_MAX_CONCURRENCY) || 8;
const fetchLimited = limitedFetch((input, init) => fetch(input, init), MAX_CONCURRENCY);

export function supabaseServer() {
  const { url, key } = supabaseEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchLimited },
  });
}

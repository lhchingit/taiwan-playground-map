// 伺服器端的 Supabase client：用 anon key，一律經過 RLS。不使用 service role key。
// 只在伺服器元件與 route handler 使用；瀏覽器不直接連 Supabase。
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY（本機請執行 pnpm env:local）');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

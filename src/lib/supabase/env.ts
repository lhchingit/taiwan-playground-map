// Supabase 的網址與 anon key（公開金鑰，一律經過 RLS）。不使用 service role key。
export function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY（本機請執行 pnpm env:local）');
  }
  return { url, key };
}

// 資料庫測試共用：連本機 Supabase。匿名使用者走 PostgREST（真的經過 RLS），
// 準備與檢查資料用 postgres 直連（superuser，不受 RLS 影響）。
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { Database } from '@/types/database';

interface LocalSupabase {
  API_URL: string;
  ANON_KEY: string;
  DB_URL: string;
}

function localSupabase(): LocalSupabase {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && DATABASE_URL) {
    return { API_URL: SUPABASE_URL, ANON_KEY: SUPABASE_ANON_KEY, DB_URL: DATABASE_URL };
  }
  try {
    return JSON.parse(
      execSync('pnpm exec supabase status -o json', { encoding: 'utf8' }),
    ) as LocalSupabase;
  } catch {
    throw new Error('讀不到本機 Supabase，請先執行 supabase start、supabase db reset、pnpm seed');
  }
}

const env = localSupabase();

export const DB_URL = env.DB_URL;

export function anonClient() {
  return createClient<Database>(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminSql() {
  return postgres(env.DB_URL, { onnotice: () => {}, max: 1 });
}

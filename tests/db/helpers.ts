// 資料庫測試共用：連本機 Supabase。匿名使用者與登入身分走 PostgREST（真的經過 RLS），
// 準備與檢查資料用 postgres 直連（superuser，不受 RLS 影響）。
// service role 只用來在測試裡建立／刪除測試帳號（auth admin API），前端絕不使用。
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { Database } from '@/types/database';

interface LocalSupabase {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  DB_URL: string;
  MAILPIT_URL?: string;
}

function localSupabase(): LocalSupabase {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && DATABASE_URL) {
    return {
      API_URL: SUPABASE_URL,
      ANON_KEY: SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY,
      DB_URL: DATABASE_URL,
    };
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
/** 本機 Supabase 的收信工具（Email 登入連結的 e2e 用） */
export const MAILPIT_URL = env.MAILPIT_URL ?? process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export function anonClient() {
  return createClient<Database>(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 還沒登入的 client；登入後就是那個身分（session JWT 經過 RLS） */
export function newClient() {
  return createClient<Database>(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 只用來建立／刪除測試帳號 */
export function authAdmin() {
  return createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

export function adminSql() {
  return postgres(env.DB_URL, { onnotice: () => {}, max: 1 });
}

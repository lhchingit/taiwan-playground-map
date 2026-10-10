// 帶登入身分的 Supabase client：session 存在 httpOnly cookie（@supabase/ssr，PKCE）。
// 只在 route handler、server action 與動態頁面（/me）使用；讀 cookie 會讓頁面變成動態，公開頁面不要用。
// 一樣只用 anon key，資料庫以登入者的 JWT 套用 RLS。
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { supabaseEnv } from './env';

export async function supabaseAuth() {
  const { url, key } = supabaseEnv();
  const store = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // 伺服器元件不能寫 cookie；session 由 src/proxy.ts 更新
        }
      },
    },
  });
}

export type AuthClient = Awaited<ReturnType<typeof supabaseAuth>>;

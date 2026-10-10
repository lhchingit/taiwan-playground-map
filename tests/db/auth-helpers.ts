// 權限測試用的身分：每個身分是一個真的 Supabase Auth 帳號，用 email＋密碼登入取得 session JWT，
// 之後所有請求都經過 PostgREST 與 RLS（CLAUDE.md：用不同身分的 JWT 直接打資料庫）。
// 角色、負責縣市、停權直接用 superuser 設定：設定角色本來就是 admin 的權限，不是這裡要測的對象。
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { authAdmin, newClient } from './helpers';

export type Role = 'member' | 'moderator' | 'admin';

export interface ActorOptions {
  /** 審核員負責的縣市 */
  cities?: string[];
  /** 是否已同意服務條款（預設是） */
  terms?: boolean;
  /** 是否停權 */
  banned?: boolean;
}

export interface Actor {
  id: string;
  email: string;
  client: ReturnType<typeof newClient>;
}

/** 測試帳號的 email 一律是 test-…@example.test，萬一沒清掉也認得出來 */
export const TEST_EMAIL = /^test-.*@example\.test$/;

export function actors(sql: postgres.Sql) {
  const admin = authAdmin();
  const created: string[] = [];

  async function create(role: Role, opts: ActorOptions = {}): Promise<Actor> {
    const email = `test-${role}-${randomUUID().slice(0, 8)}@example.test`;
    const password = randomUUID();
    const { data, error } = await admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`建立測試帳號失敗：${error?.message}`);
    const id = data.user.id;
    created.push(id);

    await sql`
      UPDATE profiles SET role = ${role},
        terms_accepted_at = ${opts.terms === false ? null : sql`now()`},
        banned_at = ${opts.banned ? sql`now()` : null},
        ban_reason = ${opts.banned ? '測試' : null}
      WHERE id = ${id}`;
    for (const city of opts.cities ?? []) {
      await sql`INSERT INTO moderator_cities (user_id, city) VALUES (${id}, ${city})`;
    }

    const client = newClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`測試帳號登入失敗：${signIn.error.message}`);
    return { id, email, client };
  }

  /** 刪除這次建立的帳號（profiles、照片跟著刪；建議的 user_id 變成 NULL） */
  async function cleanup() {
    for (const id of created.splice(0)) {
      const { error } = await admin.deleteUser(id);
      if (error && !/not.?found/i.test(error.message))
        throw new Error(`刪除測試帳號失敗：${error.message}`);
    }
  }

  return { create, cleanup, deleteUser: (id: string) => admin.deleteUser(id) };
}

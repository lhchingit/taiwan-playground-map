// 儲存篩選條件（decisions D27）的權限：用不同身分的 JWT 直接打資料庫（PostgREST＋RLS）。
// 只有本人看得到、改得了名稱、刪得掉；最多 5 組；匿名完全不能存取；刪除帳號時一起刪除。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actors, type Actor } from './auth-helpers';
import { adminSql, anonClient } from './helpers';

const sql = adminSql();
const people = actors(sql);
const anon = anonClient();

let a: Actor;
let b: Actor;
let banned: Actor;

const save = (who: Actor, name: string, query = 'play=sandpit') =>
  who.client.from('saved_filters').insert({ name, query }).select('id').single();

beforeAll(async () => {
  [a, b, banned] = await Promise.all([
    people.create('member'),
    people.create('member'),
    people.create('member', { banned: true, terms: false }),
  ]);
});

afterAll(async () => {
  await people.cleanup();
  await sql.end();
});

describe('saved_filters', () => {
  it('匿名不能讀、不能寫', async () => {
    const r = await anon.from('saved_filters').select('id');
    expect(r.error ?? r.data).toBeTruthy();
    expect(r.data ?? []).toEqual([]);
    const w = await anon.from('saved_filters').insert({ name: '匿名', query: 'play=slide' });
    expect(w.error).not.toBeNull();
  });

  it('會員可以存、只看得到自己的；別人看不到、改不了、刪不掉', async () => {
    const mine = await save(a, '沙坑');
    expect(mine.error).toBeNull();
    const id = mine.data!.id;

    const own = await a.client.from('saved_filters').select('name, query');
    expect(own.data).toEqual([{ name: '沙坑', query: 'play=sandpit' }]);

    const other = await b.client.from('saved_filters').select('id').eq('id', id);
    expect(other.data).toEqual([]);
    await b.client.from('saved_filters').update({ name: '偷改' }).eq('id', id);
    await b.client.from('saved_filters').delete().eq('id', id);
    const [row] = await sql`SELECT name FROM saved_filters WHERE id = ${id}`;
    expect(row?.name).toBe('沙坑');
  });

  it('不能冒用別人的 user_id', async () => {
    const r = await a.client
      .from('saved_filters')
      .insert({ name: '冒用', query: 'play=slide', user_id: b.id } as never);
    expect(r.error).not.toBeNull();
    const [n] = await sql`SELECT count(*)::int AS n FROM saved_filters WHERE user_id = ${b.id}`;
    expect(n?.n).toBe(0);
  });

  it('只能改名稱，不能改條件或擁有者', async () => {
    const { data } = await save(a, '改名前');
    const ok = await a.client.from('saved_filters').update({ name: '改名後' }).eq('id', data!.id);
    expect(ok.error).toBeNull();
    const q = await a.client
      .from('saved_filters')
      .update({ query: 'play=slide' })
      .eq('id', data!.id);
    expect(q.error).not.toBeNull();
    const u = await a.client
      .from('saved_filters')
      .update({ user_id: b.id } as never)
      .eq('id', data!.id);
    expect(u.error).not.toBeNull();
    const [row] = await sql`SELECT name, query, user_id FROM saved_filters WHERE id = ${data!.id}`;
    expect(row).toEqual({ name: '改名後', query: 'play=sandpit', user_id: a.id });
  });

  it('名稱空白或超過 20 字、條件空白都擋下', async () => {
    expect((await save(b, ' ')).error).not.toBeNull();
    expect((await save(b, '一'.repeat(21))).error).not.toBeNull();
    expect((await save(b, '一'.repeat(20))).error).toBeNull();
    expect((await save(b, '空條件', '')).error).not.toBeNull();
  });

  it('最多 5 組：第 6 組擋下，刪掉一組後可以再存', async () => {
    await sql`DELETE FROM saved_filters WHERE user_id = ${a.id}`;
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = await save(a, `第 ${i} 組`);
      expect(r.error).toBeNull();
      ids.push(r.data!.id);
    }
    const sixth = await save(a, '第 6 組');
    expect(sixth.error?.message).toBe('saved_filters_limit');

    await a.client.from('saved_filters').delete().eq('id', ids[0]!);
    expect((await save(a, '第 6 組')).error).toBeNull();
  });

  it('同時送出也不會超過 5 組', async () => {
    await sql`DELETE FROM saved_filters WHERE user_id = ${b.id}`;
    await Promise.all(Array.from({ length: 8 }, (_, i) => save(b, `同時 ${i}`)));
    const [n] = await sql`SELECT count(*)::int AS n FROM saved_filters WHERE user_id = ${b.id}`;
    expect(n?.n).toBe(5);
  });

  it('停權、沒同意條款的人也可以存（個人設定，不是公開內容）', async () => {
    expect((await save(banned, '停權也可以')).error).toBeNull();
  });

  it('刪除帳號時一起刪除', async () => {
    const extra = await people.create('member');
    await save(extra, '會被刪');
    await people.deleteUser(extra.id);
    const [n] = await sql`SELECT count(*)::int AS n FROM saved_filters WHERE user_id = ${extra.id}`;
    expect(n?.n).toBe(0);
  });
});

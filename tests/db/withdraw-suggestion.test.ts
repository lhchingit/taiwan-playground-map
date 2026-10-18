// 撤回修正建議（decisions D29）的權限：用不同身分的 JWT 直接打資料庫（PostgREST＋RLS）。
// 只有本人、只有待審核的建議能撤回；撤回後審核不到、可以重新回報同一個項目；仍然不能直接 UPDATE。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actors, type Actor } from './auth-helpers';
import { adminSql, anonClient } from './helpers';

const sql = adminSql();
const people = actors(sql);
const anon = anonClient();

const PLACE = 'test-withdraw-hsc'; // 新竹市（已上線）

let owner: Actor;
let other: Actor;
let mod: Actor;
let admin: Actor;
let banned: Actor;

/** 用某個身分回報一筆屬性建議，回傳 id */
async function suggest(a: Actor, key: string) {
  const { data, error } = await a.client
    .from('edit_suggestions')
    .insert({
      user_id: a.id,
      place_id: PLACE,
      kind: 'attribute',
      payload: { key, value: 'y' },
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

const withdraw = (a: Actor, id: number) => a.client.rpc('withdraw_suggestion', { p_id: id });
const statusOf = async (id: number) =>
  (await sql`SELECT status FROM edit_suggestions WHERE id = ${id}`)[0]?.status as string;

beforeAll(async () => {
  await sql`
    INSERT INTO places (id, name, city, geom)
    VALUES (${PLACE}, '撤回測試（新竹市）', 'hsc', 'SRID=4326;POINT(120.97 24.80)')`;
  [owner, other, mod, admin, banned] = await Promise.all([
    people.create('member'),
    people.create('member'),
    people.create('moderator', { cities: ['hsc'] }),
    people.create('admin'),
    people.create('member'),
  ]);
});

afterAll(async () => {
  await sql`DELETE FROM edit_suggestions WHERE place_id = ${PLACE}`;
  await sql`DELETE FROM places WHERE id = ${PLACE}`;
  await people.cleanup();
  await sql.end();
});

describe('withdraw_suggestion()', () => {
  it('本人可以撤回自己的待審建議，狀態變成 withdrawn、審核欄位維持空白', async () => {
    const id = await suggest(owner, 'slide');
    expect((await withdraw(owner, id)).error).toBeNull();
    const [row] = await sql`
      SELECT status, reviewed_by, reviewed_at FROM edit_suggestions WHERE id = ${id}`;
    expect(row).toEqual({ status: 'withdrawn', reviewed_by: null, reviewed_at: null });
  });

  it('別人、負責縣市的審核員、管理員都不能撤回不是自己的建議', async () => {
    const id = await suggest(owner, 'swing');
    for (const a of [other, mod, admin]) {
      const { error } = await withdraw(a, id);
      expect(error?.message).toBe('這筆建議不存在或已審核');
    }
    expect(await statusOf(id)).toBe('pending');
    await withdraw(owner, id);
  });

  it('匿名不能呼叫', async () => {
    const id = await suggest(owner, 'seesaw');
    const { error } = await anon.rpc('withdraw_suggestion', { p_id: id });
    expect(error).not.toBeNull();
    expect(await statusOf(id)).toBe('pending');
    await withdraw(owner, id);
  });

  it('已採納、已退回、已撤回的建議不能撤回', async () => {
    const accepted = await suggest(owner, 'sandpit');
    const rejected = await suggest(owner, 'toilet');
    expect(
      (await mod.client.rpc('review_suggestion', { p_id: accepted, p_accept: true })).error,
    ).toBeNull();
    expect(
      (
        await mod.client.rpc('review_suggestion', {
          p_id: rejected,
          p_accept: false,
          p_reason: 'unverifiable',
        })
      ).error,
    ).toBeNull();
    const withdrawn = await suggest(owner, 'shade');
    await withdraw(owner, withdrawn);

    for (const id of [accepted, rejected, withdrawn]) {
      expect((await withdraw(owner, id)).error?.message).toBe('這筆建議不存在或已審核');
    }
    expect(await statusOf(accepted)).toBe('accepted');
    expect(await statusOf(rejected)).toBe('rejected');
  });

  it('撤回後審核員審核不到；同一個項目可以重新回報', async () => {
    const id = await suggest(owner, 'footwash');
    // 撤回前，同一個項目不能重複回報（0006）
    const dup = await owner.client.from('edit_suggestions').insert({
      user_id: owner.id,
      place_id: PLACE,
      kind: 'attribute',
      payload: { key: 'footwash', value: 'n' },
    });
    expect(dup.error?.code).toBe('23505');

    await withdraw(owner, id);
    const { error } = await mod.client.rpc('review_suggestion', { p_id: id, p_accept: true });
    expect(error?.message).toBe('這筆建議不存在或已審核');
    const again = await suggest(owner, 'footwash');
    expect(await statusOf(again)).toBe('pending');
    await withdraw(owner, again);
  });

  it('停權的人可以撤回自己的建議', async () => {
    const id = await suggest(banned, 'slide');
    await sql`UPDATE profiles SET banned_at = now(), ban_reason = '測試' WHERE id = ${banned.id}`;
    expect((await withdraw(banned, id)).error).toBeNull();
    expect(await statusOf(id)).toBe('withdrawn');
  });

  it('還是不能直接 UPDATE edit_suggestions（沒有 policy）', async () => {
    const id = await suggest(owner, 'swing');
    await owner.client.from('edit_suggestions').update({ status: 'withdrawn' }).eq('id', id);
    await owner.client.from('edit_suggestions').update({ status: 'accepted' }).eq('id', id);
    expect(await statusOf(id)).toBe('pending');
    await withdraw(owner, id);
  });
});

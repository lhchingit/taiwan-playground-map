// P3 權限測試：用不同身分的 JWT 直接打資料庫（PostgREST＋RLS）。對應 docs/tasks/P3-auth-moderation.md 的完成標準。
// 前提：supabase db reset && pnpm seed && pnpm city launch hsc 已經跑過（新竹市已上線、新竹縣未上線）。
// 只用 test- 開頭的測試場地，不碰真實場地；跑完刪除測試場地、帳號與它們產生的資料。
// 照片「檔案」的測試（待審檔案公開網址打不開、核准後打得開、沒有 EXIF）在 P3(d) 建立 Storage 後補上。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '@/types/database';
import { actors, type Actor } from './auth-helpers';
import { adminSql, anonClient } from './helpers';

const sql = adminSql();
const people = actors(sql);
const anon = anonClient();

const HSC = 'test-auth-hsc'; // 新竹市（已上線）
const HSQ = 'test-auth-hsq'; // 新竹縣（未上線）

let member: Actor;
let other: Actor;
let modHsc: Actor;
let modHsq: Actor;
let admin: Actor;

beforeAll(async () => {
  const [launched] = await sql`SELECT launched_at IS NOT NULL AS on FROM cities WHERE code = 'hsc'`;
  if (!launched?.on) throw new Error('新竹市要先上線：pnpm city launch hsc');
  await sql`
    INSERT INTO places (id, name, city, geom) VALUES
      (${HSC}, '權限測試（新竹市）', 'hsc', 'SRID=4326;POINT(120.97 24.80)'),
      (${HSQ}, '權限測試（新竹縣）', 'hsq', 'SRID=4326;POINT(121.01 24.83)')`;
  [member, other, modHsc, modHsq, admin] = await Promise.all([
    people.create('member'),
    people.create('member'),
    people.create('moderator', { cities: ['hsc'] }),
    people.create('moderator', { cities: ['hsq'] }),
    people.create('admin'),
  ]);
});

afterAll(async () => {
  await people.cleanup();
  await sql`DELETE FROM places WHERE id IN (${HSC}, ${HSQ})`; // 建議、屬性、照片跟著刪
  await sql`DELETE FROM place_attribute_history WHERE place_id IN (${HSC}, ${HSQ})`;
  await sql`DELETE FROM edit_suggestions WHERE place_id IS NULL AND payload->>'name' LIKE 'test-%'`;
  await sql.end();
});

type Kind = 'attribute' | 'parking' | 'field' | 'closure' | 'new_place';

/** 用某個身分新增一筆建議（預設：自己的、待審） */
function suggest(
  a: Actor,
  row: { place_id?: string | null; kind?: Kind; payload?: Json; [k: string]: unknown },
) {
  return a.client
    .from('edit_suggestions')
    .insert({
      user_id: a.id,
      kind: 'attribute',
      payload: { key: 'footwash', value: 'y' },
      place_id: HSC,
      ...row,
    } as never)
    .select()
    .single();
}

/** 用 superuser 直接建立一筆待審建議（準備未上線縣市等情境） */
async function seedSuggestion(
  userId: string,
  placeId: string,
  payload: Json = { key: 'footwash', value: 'y' },
) {
  const [r] = await sql`
    INSERT INTO edit_suggestions (place_id, user_id, kind, payload)
    VALUES (${placeId}, ${userId}, 'attribute', ${sql.json(payload as never)}) RETURNING id`;
  return Number(r!.id);
}

const review = (a: Actor, id: number, accept: boolean, reason?: string) =>
  a.client.rpc('review_suggestion', { p_id: id, p_accept: accept, p_reason: reason });

/** 直接寫場地資料表（新增、修改、刪除）：任何身分都應該失敗或改不到任何一列（decisions D15） */
const DIRECT = [
  { table: 'places', match: { id: HSC }, update: { name: '改名' } },
  { table: 'place_attributes', match: { place_id: HSC }, update: { value: 'n' } },
  { table: 'place_parking', match: { place_id: HSC }, update: { type: 'none' } },
  { table: 'attribute_defs', match: { key: 'slide' }, update: { label: '改名' } },
  { table: 'sources', match: { id: 'hccg' }, update: { label: '改名' } },
] as const;

async function expectNoDirectWrites(a: Actor | null) {
  // supabase-js 的表名型別是字面值聯集，這裡逐表測試，用寬鬆型別呼叫
  const from = (t: string) => (a?.client ?? anon).from(t as 'places');
  const before =
    await sql`SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h FROM place_attributes x`;
  const ins = await from('place_attributes').insert({
    place_id: HSC,
    key: 'slide',
    value: 'y',
    source_id: 'user',
    verified_at: '2026-10-10',
  } as never);
  expect(ins.error?.code).toBe('42501');
  for (const d of DIRECT) {
    const upd = await from(d.table)
      .update(d.update as never)
      .match(d.match)
      .select();
    expect(upd.error === null ? upd.data : [], d.table).toEqual([]);
    const del = await from(d.table).delete().match(d.match).select();
    expect(del.error === null ? del.data : [], d.table).toEqual([]);
  }
  const [p] = await sql`SELECT name FROM places WHERE id = ${HSC}`;
  expect(p?.name).toBe('權限測試（新竹市）');
  const after =
    await sql`SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h FROM place_attributes x`;
  expect(after).toEqual(before);
}

describe('匿名使用者', () => {
  it('可以讀場地資料', async () => {
    const { data, error } = await anon.from('places').select('id').eq('city', 'hsc').limit(5);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it('不能新增建議', async () => {
    const { error } = await anon.from('edit_suggestions').insert({
      place_id: HSC,
      kind: 'attribute',
      payload: { key: 'footwash', value: 'y' },
    } as never);
    expect(error?.code).toBe('42501');
  });

  it('讀不到任何建議、profiles、待審照片、修改紀錄', async () => {
    await seedSuggestion(member.id, HSC);
    await sql`INSERT INTO photos (place_id, user_id, storage_path) VALUES (${HSC}, ${member.id}, 'photos-pending/test.webp')`;
    for (const t of [
      'edit_suggestions',
      'profiles',
      'photos',
      'place_attribute_history',
      'moderator_cities',
    ] as const) {
      const { data, error } = await anon.from(t as 'places').select('*');
      expect(error === null ? data : []).toEqual([]);
    }
  });

  it('不能呼叫 review_suggestion()', async () => {
    const id = await seedSuggestion(member.id, HSC);
    const { error } = await anon.rpc('review_suggestion', { p_id: id, p_accept: true });
    expect(error).not.toBeNull();
    const [s] = await sql`SELECT status FROM edit_suggestions WHERE id = ${id}`;
    expect(s?.status).toBe('pending');
  });

  it('不能新增照片紀錄', async () => {
    const { error } = await anon
      .from('photos')
      .insert({ place_id: HSC, storage_path: 'photos-pending/x.webp' } as never);
    expect(error?.code).toBe('42501');
  });

  it('不能直接寫場地資料表', () => expectNoDirectWrites(null));
});

describe('會員', () => {
  it('第一次登入時建立 profile，預設暱稱是「家長」＋4 位數（不用社群帳號名稱）', async () => {
    const { data } = await member.client.from('profiles').select('display_name, role').single();
    expect(data?.role).toBe('member');
    expect(data?.display_name).toMatch(/^家長 \d{4}$/);
  });

  it('可以新增自己的待審建議', async () => {
    const { data, error } = await suggest(member, {});
    expect(error).toBeNull();
    expect(data).toMatchObject({ user_id: member.id, status: 'pending', place_id: HSC });
  });

  it('不能把 status 設成 accepted，也不能自己填審核欄位', async () => {
    for (const extra of [
      { status: 'accepted' },
      { reviewed_by: member.id },
      { reviewed_at: new Date().toISOString() },
      { reject_reason: 'other' },
      { review_note: '自己核准' },
    ]) {
      const { error } = await suggest(member, extra);
      expect(error?.code, JSON.stringify(extra)).toBe('42501');
    }
  });

  it('不能用別人的 user_id 新增', async () => {
    const { error } = await suggest(member, { user_id: other.id });
    expect(error?.code).toBe('42501');
  });

  it('新增後不能修改或刪除（只能透過審核）', async () => {
    const { data } = await suggest(member, {});
    const upd = await member.client
      .from('edit_suggestions')
      .update({ status: 'accepted' })
      .eq('id', data!.id)
      .select();
    expect(upd.error === null ? upd.data : []).toEqual([]);
    const del = await member.client.from('edit_suggestions').delete().eq('id', data!.id).select();
    expect(del.error === null ? del.data : []).toEqual([]);
    const [s] = await sql`SELECT status FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s?.status).toBe('pending');
  });

  it('只讀得到自己的建議', async () => {
    await suggest(other, {});
    const { data } = await member.client.from('edit_suggestions').select('user_id');
    expect(data?.length).toBeGreaterThan(0);
    expect(new Set(data?.map((r) => r.user_id))).toEqual(new Set([member.id]));
  });

  it('不能改自己的角色、採納次數、停權欄位、建立時間', async () => {
    for (const patch of [
      { role: 'admin' },
      { accepted_count: 99 },
      { banned_at: null, ban_reason: '自己解除' },
      { banned_at: new Date().toISOString() },
      { created_at: '2020-01-01T00:00:00Z' },
    ]) {
      const { error } = await member.client
        .from('profiles')
        .update(patch as never)
        .eq('id', member.id);
      expect(error, JSON.stringify(patch)).not.toBeNull();
    }
    const [p] = await sql`SELECT role, accepted_count FROM profiles WHERE id = ${member.id}`;
    expect(p).toMatchObject({ role: 'member', accepted_count: 0 });
  });

  it('可以改自己的暱稱，改不到別人的', async () => {
    const own = await member.client
      .from('profiles')
      .update({ display_name: '小明爸爸' })
      .eq('id', member.id)
      .select();
    expect(own.data?.[0]?.display_name).toBe('小明爸爸');
    const others = await member.client
      .from('profiles')
      .update({ display_name: '亂改' })
      .eq('id', other.id)
      .select();
    expect(others.error === null ? others.data : []).toEqual([]);
  });

  it('同意服務條款：時間一律用伺服器時間，同意後不能再改', async () => {
    const fresh = await people.create('member', { terms: false });
    const set = await fresh.client
      .from('profiles')
      .update({ terms_accepted_at: '2000-01-01T00:00:00Z' })
      .eq('id', fresh.id)
      .select('terms_accepted_at')
      .single();
    expect(set.error).toBeNull();
    expect(Date.now() - new Date(set.data!.terms_accepted_at!).getTime()).toBeLessThan(60_000);
    const again = await fresh.client
      .from('profiles')
      .update({ terms_accepted_at: null })
      .eq('id', fresh.id);
    expect(again.error).not.toBeNull();
  });

  it('沒同意服務條款時不能新增建議與照片', async () => {
    const fresh = await people.create('member', { terms: false });
    expect((await suggest(fresh, {})).error?.code).toBe('42501');
    const photo = await fresh.client
      .from('photos')
      .insert({ place_id: HSC, user_id: fresh.id, storage_path: 'photos-pending/x.webp' });
    expect(photo.error?.code).toBe('42501');
  });

  it('不能呼叫 review_suggestion()', async () => {
    const id = await seedSuggestion(other.id, HSC);
    const { error } = await review(member, id, true);
    expect(error?.message).toContain('沒有審核權限');
  });

  it('不能直接寫場地資料表', () => expectNoDirectWrites(member));

  it('未上線縣市的場地不能提交建議', async () => {
    const { error } = await suggest(member, { place_id: HSQ });
    expect(error?.code).toBe('42501');
    const np = await suggest(member, {
      place_id: null,
      kind: 'new_place',
      payload: { name: 'test-新竹縣新場地', lat: 24.83, lng: 121.01, city: 'hsq' },
    });
    expect(np.error?.code).toBe('42501');
  });

  it('建議內容格式錯誤時被拒絕', async () => {
    const bad: { kind: Kind; payload: Json; place_id?: string | null; why: string }[] = [
      { kind: 'attribute', payload: { key: 'not_a_key', value: 'y' }, why: '沒有這個設施項目' },
      { kind: 'attribute', payload: { key: 'footwash', value: 'yes' }, why: 'y、n、u' },
      {
        kind: 'attribute',
        payload: { key: 'footwash', value: 'y' },
        place_id: null,
        why: '要指定場地',
      },
      { kind: 'parking', payload: { type: 'garage' }, why: '停車類型' },
      { kind: 'parking', payload: { type: 'lot', spaces: -3 }, why: '格數' },
      { kind: 'parking', payload: { type: 'lot', spaces: 2.5 }, why: '格數' },
      { kind: 'field', payload: { field: 'name', value: '改名' }, why: '不能回報' },
      { kind: 'closure', payload: { reason: '維修', until: '下個月' }, why: '日期格式' },
      {
        kind: 'new_place',
        payload: { name: 'test-外海', lat: 10, lng: 120, city: 'hsc' },
        place_id: null,
        why: '台灣範圍',
      },
      {
        kind: 'new_place',
        payload: { name: 'test-x', lat: 24.8, lng: 120.9, city: 'hsc' },
        why: '不能指定場地',
      },
    ];
    for (const { why, ...b } of bad) {
      const { error } = await suggest(member, b);
      expect(error?.message, why).toContain(why);
    }
  });

  it('各種格式正確的建議都可以新增', async () => {
    const ok: { kind: Kind; payload: Json; place_id?: string | null }[] = [
      {
        kind: 'parking',
        payload: { type: 'lot', fee: 'paid', spaces: 40, fee_note: '每小時 30 元' },
      },
      { kind: 'field', payload: { field: 'hours', value: '06:00–22:00' } },
      { kind: 'closure', payload: { reason: '遊具維修中', until: '2026-12-31' } },
      {
        kind: 'new_place',
        payload: { name: 'test-新場地', lat: 24.8, lng: 120.97, city: 'hsc' },
        place_id: null,
      },
    ];
    for (const o of ok) {
      const { error } = await suggest(member, o);
      expect(error, o.kind).toBeNull();
    }
  });
});

describe('每日上限', () => {
  it('24 小時內第 31 筆建議被拒絕', async () => {
    const heavy = await people.create('member');
    await sql`
      INSERT INTO edit_suggestions (place_id, user_id, kind, payload)
      SELECT ${HSC}, ${heavy.id}, 'attribute', '{"key":"footwash","value":"y"}'::jsonb FROM generate_series(1, 29)`;
    expect((await suggest(heavy, {})).error).toBeNull(); // 第 30 筆
    const { error } = await suggest(heavy, {}); // 第 31 筆
    expect(error?.message).toContain('今天的回報次數已達上限');
  });
});

describe('審核員', () => {
  it('讀得到負責縣市的建議，讀不到其他縣市的', async () => {
    const hsq = await seedSuggestion(member.id, HSQ);
    const hsc = await seedSuggestion(member.id, HSC);
    const seen = async (a: Actor) =>
      new Set(
        (await a.client.from('edit_suggestions').select('id').in('id', [hsq, hsc])).data?.map(
          (r) => r.id,
        ),
      );
    expect(await seen(modHsc)).toEqual(new Set([hsc]));
    // 新竹縣尚未上線，場地 RLS 讀不到，但負責的審核員仍然看得到、審得了（place_city()）
    expect(await seen(modHsq)).toEqual(new Set([hsq]));
    expect(await seen(admin)).toEqual(new Set([hsq, hsc]));
  });

  it('新竹市審核員不能審核新竹縣的建議；新竹縣審核員可以', async () => {
    const id = await seedSuggestion(member.id, HSQ);
    expect((await review(modHsc, id, true)).error?.message).toContain('沒有審核權限');
    expect((await review(modHsq, id, false, 'duplicate')).error).toBeNull();
  });

  it('不能審核自己提交的建議', async () => {
    const { data } = await suggest(modHsc, {});
    const { error } = await review(modHsc, data!.id, true);
    expect(error?.message).toContain('不能審核自己的建議');
  });

  it('不能審核已經審核過的建議', async () => {
    const id = await seedSuggestion(member.id, HSC);
    expect((await review(modHsc, id, false, 'outdated')).error).toBeNull();
    expect((await review(modHsc, id, true)).error?.message).toContain('已審核');
  });

  it('核准 attribute：屬性值與來源更新、places.attrs 同步、多一筆修改紀錄、採納次數加 1', async () => {
    const submitter = await people.create('member');
    const { data } = await suggest(submitter, {
      payload: { key: 'footwash', value: 'y', note: '東側入口' },
    });
    const [{ n: before } = { n: 0 }] =
      await sql`SELECT count(*)::int AS n FROM place_attribute_history WHERE place_id = ${HSC} AND key = 'footwash'`;

    expect((await review(modHsc, data!.id, true)).error).toBeNull();

    const [attr] =
      await sql`SELECT value, source_id, note, verified_at FROM place_attributes WHERE place_id = ${HSC} AND key = 'footwash'`;
    expect(attr).toMatchObject({ value: 'y', source_id: 'user', note: '東側入口' });
    expect(attr?.verified_at).not.toBeNull();
    const [place] = await sql`SELECT attrs FROM places WHERE id = ${HSC}`;
    expect(place?.attrs).toMatchObject({ footwash: 'y' });
    const hist = await sql`SELECT new_value, new_source, changed_by FROM place_attribute_history
                           WHERE place_id = ${HSC} AND key = 'footwash' ORDER BY id`;
    expect(hist.length).toBe(before + 1);
    expect(hist.at(-1)).toMatchObject({
      new_value: 'y',
      new_source: 'user',
      changed_by: modHsc.id,
    });
    const [p] = await sql`SELECT accepted_count FROM profiles WHERE id = ${submitter.id}`;
    expect(p?.accepted_count).toBe(1);
    const [s] =
      await sql`SELECT status, reviewed_by, reviewed_at FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s).toMatchObject({ status: 'accepted', reviewed_by: modHsc.id });
    expect(s?.reviewed_at).not.toBeNull();

    // 提交者在自己的建議看得到結果
    const mine = await submitter.client
      .from('edit_suggestions')
      .select('status')
      .eq('id', data!.id)
      .single();
    expect(mine.data?.status).toBe('accepted');
  });

  it('退回：記錄原因，屬性不變', async () => {
    const { data } = await suggest(member, { payload: { key: 'shade', value: 'n' } });
    expect((await review(modHsc, data!.id, false, 'unverifiable')).error).toBeNull();
    const [s] =
      await sql`SELECT status, reject_reason FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s).toMatchObject({ status: 'rejected', reject_reason: 'unverifiable' });
    const rows =
      await sql`SELECT 1 FROM place_attributes WHERE place_id = ${HSC} AND key = 'shade'`;
    expect(rows.length).toBe(0);
    const mine = await member.client
      .from('edit_suggestions')
      .select('status, reject_reason')
      .eq('id', data!.id)
      .single();
    expect(mine.data).toMatchObject({ status: 'rejected', reject_reason: 'unverifiable' });
  });

  it('讀得到負責縣市的修改紀錄，會員讀不到', async () => {
    const mod = await modHsc.client
      .from('place_attribute_history')
      .select('place_id')
      .eq('place_id', HSC);
    expect(mod.data?.length).toBeGreaterThan(0);
    const mem = await member.client
      .from('place_attribute_history')
      .select('place_id')
      .eq('place_id', HSC);
    expect(mem.data).toEqual([]);
  });

  it('不能直接寫場地資料表', () => expectNoDirectWrites(modHsc));
});

describe('管理員', () => {
  it('可以審核任何縣市的建議', async () => {
    for (const place of [HSC, HSQ]) {
      const id = await seedSuggestion(member.id, place);
      expect((await review(admin, id, false, 'other')).error).toBeNull();
    }
  });

  it('也不能直接寫場地資料表（decisions D15）', () => expectNoDirectWrites(admin));
});

describe('停權', () => {
  it('被停權的會員所有寫入都失敗，app_role() 是 NULL', async () => {
    const banned = await people.create('member', { banned: true });
    expect((await banned.client.rpc('app_role')).data).toBeNull();
    expect((await suggest(banned, {})).error?.code).toBe('42501');
    const photo = await banned.client
      .from('photos')
      .insert({ place_id: HSC, user_id: banned.id, storage_path: 'photos-pending/x.webp' });
    expect(photo.error?.code).toBe('42501');
    const nick = await banned.client
      .from('profiles')
      .update({ display_name: '改名' })
      .eq('id', banned.id)
      .select();
    expect(nick.error === null ? nick.data : []).toEqual([]);
  });

  it('被停權的審核員不能審核', async () => {
    const bannedMod = await people.create('moderator', { cities: ['hsc'], banned: true });
    const id = await seedSuggestion(member.id, HSC);
    expect((await review(bannedMod, id, true)).error?.message).toContain('沒有審核權限');
  });
});

describe('照片紀錄', () => {
  it('會員可以新增自己的待審照片；公開只看得到已核准的', async () => {
    const ins = await member.client
      .from('photos')
      .insert({ place_id: HSC, user_id: member.id, storage_path: 'photos-pending/a.webp' })
      .select()
      .single();
    expect(ins.error).toBeNull();
    // 會員不能自己標成已核准或已移除 EXIF
    for (const extra of [{ status: 'approved' }, { exif_stripped: true }]) {
      const bad = await member.client.from('photos').insert({
        place_id: HSC,
        user_id: member.id,
        storage_path: 'photos-pending/b.webp',
        ...extra,
      } as never);
      expect(bad.error?.code, JSON.stringify(extra)).toBe('42501');
    }
    const pub = async () => (await anon.from('photos').select('id').eq('id', ins.data!.id)).data;
    expect(await pub()).toEqual([]);
    const upd = await modHsc.client
      .from('photos')
      .update({ status: 'approved' })
      .eq('id', ins.data!.id)
      .select();
    expect(upd.data?.length).toBe(1);
    expect(await pub()).toEqual([{ id: ins.data!.id }]);
  });

  it('會員不能審核照片', async () => {
    const [p] = await sql`INSERT INTO photos (place_id, user_id, storage_path)
                          VALUES (${HSC}, ${other.id}, 'photos-pending/c.webp') RETURNING id`;
    const upd = await member.client
      .from('photos')
      .update({ status: 'approved' })
      .eq('id', p!.id)
      .select();
    expect(upd.error === null ? upd.data : []).toEqual([]);
  });
});

describe('刪除帳號', () => {
  it('已採納的建議保留但不再有提交者；照片一併刪除', async () => {
    const leaving = await people.create('member');
    const { data } = await suggest(leaving, { payload: { key: 'toilet', value: 'y' } });
    expect((await review(modHsc, data!.id, true)).error).toBeNull();
    await sql`INSERT INTO photos (place_id, user_id, storage_path) VALUES (${HSC}, ${leaving.id}, 'photos-pending/d.webp')`;

    const { error } = await people.deleteUser(leaving.id);
    expect(error).toBeNull();

    const [s] = await sql`SELECT status, user_id FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s).toMatchObject({ status: 'accepted', user_id: null });
    const [attr] =
      await sql`SELECT value, source_id FROM place_attributes WHERE place_id = ${HSC} AND key = 'toilet'`;
    expect(attr).toMatchObject({ value: 'y', source_id: 'user' });
    expect((await sql`SELECT 1 FROM photos WHERE user_id = ${leaving.id}`).length).toBe(0);
    expect((await sql`SELECT 1 FROM profiles WHERE id = ${leaving.id}`).length).toBe(0);
  });

  it('delete_my_account()：會員自己刪除帳號，只刪自己（「我的貢獻」頁）', async () => {
    const leaving = await people.create('member');
    const { data } = await suggest(leaving, { payload: { key: 'shade', value: 'y' } });
    expect((await review(modHsc, data!.id, true)).error).toBeNull();

    const { error } = await leaving.client.rpc('delete_my_account');
    expect(error).toBeNull();

    expect((await sql`SELECT 1 FROM auth.users WHERE id = ${leaving.id}`).length).toBe(0);
    expect((await sql`SELECT 1 FROM profiles WHERE id = ${leaving.id}`).length).toBe(0);
    const [s] = await sql`SELECT status, user_id FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s).toMatchObject({ status: 'accepted', user_id: null });
    // 其他人不受影響
    expect((await sql`SELECT 1 FROM profiles WHERE id = ${member.id}`).length).toBe(1);
  });

  it('delete_my_account()：被停權的人也能刪除自己的帳號', async () => {
    const banned = await people.create('member', { banned: true });
    expect((await banned.client.rpc('delete_my_account')).error).toBeNull();
    expect((await sql`SELECT 1 FROM auth.users WHERE id = ${banned.id}`).length).toBe(0);
  });

  it('delete_my_account()：匿名使用者不能呼叫', async () => {
    const [{ n: before } = { n: 0 }] = await sql`SELECT count(*)::int AS n FROM auth.users`;
    const { error } = await anon.rpc('delete_my_account');
    expect(error).not.toBeNull();
    const [{ n: after } = { n: 0 }] = await sql`SELECT count(*)::int AS n FROM auth.users`;
    expect(after).toBe(before);
  });
});

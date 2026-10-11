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
  rotation = (
    await sql`SELECT key FROM attribute_defs WHERE key NOT IN ('footwash', 'shade', 'toilet') ORDER BY key`
  ).map((r) => r.key as string);
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
  await sql`DELETE FROM place_field_history WHERE place_id IN (${HSC}, ${HSQ})`;
  await sql`DELETE FROM admin_log WHERE actor = ${admin.id}`;
  await sql`DELETE FROM edit_suggestions WHERE place_id IS NULL AND payload->>'name' LIKE 'test-%'`;
  await sql.end();
});

type Kind = 'attribute' | 'parking' | 'field' | 'closure' | 'new_place';

// 同一個人對同一個場地的同一個項目只能有一筆待審建議（0006），預設的建議輪流用不同的設施項目。
// footwash、shade、toilet 留給明確指定的測試使用。
let rotation: string[] = [];
const turns = new Map<string, number>();
function nextPayload(userId: string, placeId: string | null | undefined): Json {
  const k = `${userId}:${placeId}`;
  const n = turns.get(k) ?? 0;
  if (n >= rotation.length)
    throw new Error(`${k} 的待審建議超過 ${rotation.length} 筆，測試要換人或換場地`);
  turns.set(k, n + 1);
  return { key: rotation[n]!, value: 'y' };
}

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
      payload: nextPayload(a.id, row.place_id === undefined ? HSC : row.place_id),
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
  payload: Json = nextPayload(userId, placeId),
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

describe('重複回報（0006）', () => {
  it('同一個人、同一個場地、同一個項目只能有一筆待審建議', async () => {
    const dup = await people.create('member');
    const first = await suggest(dup, { payload: { key: 'footwash', value: 'y' } });
    expect(first.error).toBeNull();
    // 值不同也算同一個項目
    const again = await suggest(dup, { payload: { key: 'footwash', value: 'n' } });
    expect(again.error?.code).toBe('23505');
    // 不同項目、停車、封閉、基本資料各自可以有一筆
    expect((await suggest(dup, { payload: { key: 'shade', value: 'y' } })).error).toBeNull();
    for (const [kind, payload] of [
      ['parking', { type: 'lot' }],
      ['closure', { reason: '維修' }],
      ['field', { field: 'hours', value: '24 小時' }],
    ] as const) {
      expect((await suggest(dup, { kind, payload })).error, kind).toBeNull();
      expect((await suggest(dup, { kind, payload })).error?.code, kind).toBe('23505');
    }
    expect(
      (await suggest(dup, { kind: 'field', payload: { field: 'surface', value: '人工草皮' } }))
        .error,
    ).toBeNull();
    // 別人不受影響
    const other2 = await people.create('member');
    expect((await suggest(other2, { payload: { key: 'footwash', value: 'y' } })).error).toBeNull();
    // 審核過之後可以再提交
    expect((await review(modHsc, first.data!.id, false, 'unverifiable')).error).toBeNull();
    expect((await suggest(dup, { payload: { key: 'footwash', value: 'y' } })).error).toBeNull();
  });
});

describe('每日上限', () => {
  it('24 小時內第 31 筆建議被拒絕', async () => {
    const heavy = await people.create('member');
    // 先放 29 筆已退回的（上限不分狀態都算；待審的同一項目只能有一筆）
    await sql`
      INSERT INTO edit_suggestions (place_id, user_id, kind, payload, status, reject_reason)
      SELECT ${HSC}, ${heavy.id}, 'attribute', '{"key":"footwash","value":"y"}'::jsonb, 'rejected', 'other'
      FROM generate_series(1, 29)`;
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

describe('核准時套用基本資料與封閉（0007）', () => {
  // 用新的提交者：member 在前面的測試已經有同一個場地的待審建議（同一個項目只能有一筆）
  let submitter: Actor;
  beforeAll(async () => {
    submitter = await people.create('member');
  });
  const review5 = (a: Actor, id: number, accept: boolean, payload?: Json, reason?: string) =>
    a.client.rpc('review_suggestion', {
      p_id: id,
      p_accept: accept,
      p_reason: reason,
      p_payload: payload,
    });

  it('基本資料：審核員修改後套用，原始建議不變，留下來源與修改紀錄', async () => {
    const { data } = await suggest(submitter, {
      kind: 'field',
      payload: { field: 'hours', value: '06:00–22:00' },
    });
    const applied = { field: 'hours', value: '05:30–22:00' };
    expect((await review5(modHsc, data!.id, true, applied)).error).toBeNull();

    const [p] =
      await sql`SELECT hours, hours_source, hours_verified_at FROM places WHERE id = ${HSC}`;
    expect(p).toMatchObject({ hours: '05:30–22:00', hours_source: 'user' });
    expect(p?.hours_verified_at).not.toBeNull();
    const [s] =
      await sql`SELECT payload, applied_payload FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s).toEqual({
      payload: { field: 'hours', value: '06:00–22:00' },
      applied_payload: applied,
    });
    const [h] = await sql`SELECT field, new_value, new_source, suggestion_id, changed_by
                          FROM place_field_history WHERE suggestion_id = ${data!.id}`;
    expect(h).toMatchObject({
      field: 'hours',
      new_value: '05:30–22:00',
      new_source: 'user',
      changed_by: modHsc.id,
    });
  });

  it('審核員修改的內容也要符合格式', async () => {
    const { data } = await suggest(submitter, {
      kind: 'field',
      payload: { field: 'surface', value: '人工草皮' },
    });
    expect(
      (await review5(modHsc, data!.id, true, { field: 'name', value: '改名' })).error?.message,
    ).toContain('不能回報');
    expect(
      (await review5(modHsc, data!.id, true, { field: 'surface', value: ' ' })).error?.message,
    ).toContain('1～100');
    const [s] = await sql`SELECT status FROM edit_suggestions WHERE id = ${data!.id}`;
    expect(s?.status).toBe('pending');
  });

  it('封閉：狀態改成已封閉並記錄預計恢復日期；恢復開放只有負責的審核員可以', async () => {
    const { data } = await suggest(submitter, {
      kind: 'closure',
      payload: { reason: '遊具維修中', until: '2026-12-31' },
    });
    expect(
      (
        await review5(modHsc, data!.id, true, {
          reason: '整修封閉',
          until: '2027-01-15',
          status: 'closed',
        })
      ).error,
    ).toBeNull();
    const [p] =
      await sql`SELECT status, status_until::text, status_note, status_source FROM places WHERE id = ${HSC}`;
    expect(p).toEqual({
      status: 'closed',
      status_until: '2027-01-15',
      status_note: '整修封閉',
      status_source: 'user',
    });

    expect((await member.client.rpc('reopen_place', { p_place_id: HSC })).error?.message).toContain(
      '沒有審核權限',
    );
    expect((await modHsq.client.rpc('reopen_place', { p_place_id: HSC })).error?.message).toContain(
      '沒有審核權限',
    );
    expect((await anon.rpc('reopen_place', { p_place_id: HSC })).error).not.toBeNull();
    expect(
      (await modHsc.client.rpc('reopen_place', { p_place_id: HSC, p_note: '已恢復' })).error,
    ).toBeNull();
    const [q] = await sql`SELECT status, status_until, status_note FROM places WHERE id = ${HSC}`;
    expect(q).toEqual({ status: 'open', status_until: null, status_note: null });
    expect((await modHsc.client.rpc('reopen_place', { p_place_id: HSC })).error?.message).toContain(
      '沒有標示',
    );
    const hist = await sql`SELECT old_value, new_value FROM place_field_history
                           WHERE place_id = ${HSC} AND field = 'status' ORDER BY id`;
    expect(hist.map((r) => `${r.old_value}→${r.new_value}`)).toEqual([
      'open→closed',
      'closed→open',
    ]);
  });

  it('封閉的預計恢復日期不存在時被拒絕（例如 2 月 30 日）', async () => {
    const { error } = await suggest(submitter, {
      kind: 'closure',
      payload: { reason: '維修', until: '2026-02-30' },
    });
    expect(error?.message).toContain('日期格式錯誤');
  });

  it('新增場地的建議目前不能核准，只能退回', async () => {
    const [r] = await sql`
      INSERT INTO edit_suggestions (place_id, user_id, kind, payload)
      VALUES (NULL, ${submitter.id}, 'new_place', '{"name":"test-新場地","lat":24.8,"lng":120.97,"city":"hsc"}')
      RETURNING id`;
    const id = Number(r!.id);
    expect((await review5(modHsc, id, true)).error?.message).toContain('新增場地的核准還沒開放');
    expect((await review5(modHsc, id, false, undefined, 'other')).error).toBeNull();
  });

  it('負責的審核員讀得到未上線縣市的場地、屬性、停車；其他人讀不到', async () => {
    await sql`INSERT INTO place_attributes (place_id, key, value, source_id, verified_at)
              VALUES (${HSQ}, 'slide', 'y', 'user', '2026-10-11') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO place_parking (place_id, type) VALUES (${HSQ}, 'u')`;
    const read = async (c: ReturnType<typeof anonClient>) => [
      (await c.from('places').select('id').eq('id', HSQ)).data?.length ?? 0,
      (await c.from('place_attributes').select('key').eq('place_id', HSQ)).data?.length ?? 0,
      (await c.from('place_parking').select('id').eq('place_id', HSQ)).data?.length ?? 0,
    ];
    expect(await read(modHsq.client)).toEqual([1, 1, 1]);
    expect(await read(admin.client)).toEqual([1, 1, 1]);
    expect(await read(modHsc.client)).toEqual([0, 0, 0]);
    expect(await read(member.client)).toEqual([0, 0, 0]);
    expect(await read(anon)).toEqual([0, 0, 0]);
  });

  it('基本欄位的修改紀錄：負責的審核員讀得到，會員讀不到', async () => {
    const mod = await modHsc.client.from('place_field_history').select('id').eq('place_id', HSC);
    expect(mod.data?.length).toBeGreaterThan(0);
    const mem = await member.client.from('place_field_history').select('id').eq('place_id', HSC);
    expect(mem.data).toEqual([]);
  });
});

describe('修改紀錄的還原（0008）', () => {
  let sub: Actor;
  beforeAll(async () => {
    sub = await people.create('member');
  });
  const approve = async (payload: Json, kind: Kind = 'attribute') => {
    const { data, error } = await suggest(sub, { kind, payload });
    expect(error).toBeNull();
    expect((await review(modHsc, data!.id, true)).error).toBeNull();
    return data!.id;
  };
  const lastAttrHistory = async (key: string) =>
    Number(
      (
        await sql`SELECT max(id) AS id FROM place_attribute_history WHERE place_id = ${HSC} AND key = ${key}`
      )[0]!.id,
    );
  const restoreAttr = (a: Actor | null, id: number) =>
    (a?.client ?? anon).rpc('restore_attribute', { p_history_id: id });

  it('回到新增之前：那一列刪除、屬性回到未知；再還原一次是「已經是這個版本」', async () => {
    await approve({ key: 'handwash', value: 'y' });
    const h = await lastAttrHistory('handwash');
    expect((await restoreAttr(modHsc, h)).error).toBeNull();
    expect(
      await sql`SELECT 1 FROM place_attributes WHERE place_id = ${HSC} AND key = 'handwash'`,
    ).toHaveLength(0);
    const [p] = await sql`SELECT attrs FROM places WHERE id = ${HSC}`;
    expect(p?.attrs).not.toHaveProperty('handwash');
    const [last] = await sql`SELECT old_value, new_value, changed_by FROM place_attribute_history
                             WHERE place_id = ${HSC} AND key = 'handwash' ORDER BY id DESC LIMIT 1`;
    expect(last).toMatchObject({ old_value: 'y', new_value: null, changed_by: modHsc.id });
    expect((await restoreAttr(modHsc, h)).error?.message).toContain('已經是這個版本');
  });

  it('回到修改之前：值、來源、確認日期都恢復', async () => {
    await sql`INSERT INTO place_attributes (place_id, key, value, note, source_id, verified_at)
              VALUES (${HSC}, 'stroller', 'y', '清冊', 'hccg', '2026-01-02')`;
    await approve({ key: 'stroller', value: 'n', note: '有階梯' });
    const h = await lastAttrHistory('stroller');
    expect((await restoreAttr(modHsc, h)).error).toBeNull();
    const [a] = await sql`SELECT value, note, source_id, verified_at::text FROM place_attributes
                          WHERE place_id = ${HSC} AND key = 'stroller'`;
    expect(a).toEqual({ value: 'y', note: '清冊', source_id: 'hccg', verified_at: '2026-01-02' });
  });

  it('基本欄位與狀態：回到修改之前，留下還原紀錄', async () => {
    const fieldId = await approve({ field: 'surface', value: 'PU 地墊' }, 'field');
    const [fh] = await sql`SELECT id FROM place_field_history WHERE suggestion_id = ${fieldId}`;
    const restoreField = (id: unknown) =>
      modHsc.client.rpc('restore_field', { p_history_id: Number(id) });
    expect((await restoreField(fh!.id)).error).toBeNull();
    const [p] = await sql`SELECT surface, surface_source FROM places WHERE id = ${HSC}`;
    expect(p).toEqual({ surface: null, surface_source: null });
    const [r] =
      await sql`SELECT restored_from, changed_by FROM place_field_history ORDER BY id DESC LIMIT 1`;
    expect(r).toEqual({ restored_from: fh!.id, changed_by: modHsc.id });

    const closureId = await approve(
      { reason: '整修', until: '2027-02-01', status: 'closed' },
      'closure',
    );
    const [ch] = await sql`SELECT id FROM place_field_history WHERE suggestion_id = ${closureId}`;
    expect((await restoreField(ch!.id)).error).toBeNull();
    const [q] = await sql`SELECT status, status_until, status_note FROM places WHERE id = ${HSC}`;
    expect(q).toEqual({ status: 'open', status_until: null, status_note: null });
    expect((await restoreField(ch!.id)).error?.message).toContain('已經是這個版本');
  });

  it('會員、其他縣市的審核員、匿名不能還原；管理員可以', async () => {
    await approve({ key: 'food', value: 'y' });
    const h = await lastAttrHistory('food');
    for (const a of [member, modHsq]) {
      expect((await restoreAttr(a, h)).error?.message).toContain('沒有審核權限');
    }
    expect((await restoreAttr(null, h)).error).not.toBeNull();
    expect((await restoreAttr(admin, h)).error).toBeNull();
  });
});

describe('管理員的使用者管理（0008）', () => {
  let target: Actor;
  beforeAll(async () => {
    target = await people.create('member');
  });
  const call = (a: Actor | null, fn: string, args: Record<string, unknown>) =>
    (a?.client ?? anon).rpc(fn as 'admin_unban', args as never);

  it('使用者列表（含 Email）只有管理員能看，可以用 Email 搜尋', async () => {
    const { data, error } = await admin.client.rpc('admin_list_users', {
      p_query: target.email.slice(0, 18),
    });
    expect(error).toBeNull();
    const row = data?.find((r) => r.id === target.id);
    expect(row).toMatchObject({ email: target.email, role: 'member', cities: [] });
    expect(row?.display_name).toMatch(/^家長 \d{4}$/);
    for (const a of [modHsc, member, null]) {
      expect((await call(a, 'admin_list_users', {})).error).not.toBeNull();
    }
    // 搜尋字串不當成萬用字元
    const pct = await admin.client.rpc('admin_list_users', { p_query: '%' });
    expect(pct.data?.some((r) => r.id === target.id)).toBe(false);
  });

  it('改成審核員並指派新竹市後可以審核；改回會員時負責縣市清掉', async () => {
    const set = (args: Record<string, unknown>) => call(admin, 'admin_set_cities', args);
    expect(
      (await call(admin, 'admin_set_role', { p_user: target.id, p_role: 'moderator' })).error,
    ).toBeNull();
    expect((await set({ p_user: target.id, p_cities: ['zzz'] })).error?.message).toContain(
      '沒有這個縣市',
    );
    expect((await set({ p_user: target.id, p_cities: ['hsc'] })).error).toBeNull();
    const id = await seedSuggestion(member.id, HSC);
    expect((await review(target, id, false, 'other')).error).toBeNull();

    expect(
      (await call(admin, 'admin_set_role', { p_user: target.id, p_role: 'member' })).error,
    ).toBeNull();
    expect(await sql`SELECT 1 FROM moderator_cities WHERE user_id = ${target.id}`).toHaveLength(0);
    expect(
      (await call(admin, 'admin_set_role', { p_user: target.id, p_role: 'trusted' })).error,
    ).not.toBeNull();
    expect((await set({ p_user: target.id, p_cities: ['hsc'] })).error?.message).toContain(
      '只有審核員',
    );
  });

  it('停權原因必填；停權後寫入失敗，解除後恢復', async () => {
    const ban = (reason: string) =>
      call(admin, 'admin_ban', { p_user: target.id, p_reason: reason });
    expect((await ban('  ')).error?.message).toContain('停權原因');
    expect((await ban('大量灌水')).error).toBeNull();
    expect((await suggest(target, {})).error?.code).toBe('42501');
    const [p] = await sql`SELECT ban_reason FROM profiles WHERE id = ${target.id}`;
    expect(p?.ban_reason).toBe('大量灌水');
    expect((await call(admin, 'admin_unban', { p_user: target.id })).error).toBeNull();
    expect((await suggest(target, {})).error).toBeNull();
  });

  it('不能對自己操作；審核員、會員不能呼叫管理員函式', async () => {
    const self = await call(admin, 'admin_set_role', { p_user: admin.id, p_role: 'member' });
    expect(self.error?.message).toContain('不能對自己');
    const selfBan = await call(admin, 'admin_ban', { p_user: admin.id, p_reason: 'x' });
    expect(selfBan.error?.message).toContain('不能對自己');
    for (const a of [modHsc, member]) {
      const r1 = await call(a, 'admin_set_role', { p_user: target.id, p_role: 'admin' });
      expect(r1.error?.message).toContain('只有管理員');
      const r2 = await call(a, 'admin_ban', { p_user: target.id, p_reason: 'x' });
      expect(r2.error?.message).toContain('只有管理員');
    }
    const [p] = await sql`SELECT role, banned_at FROM profiles WHERE id = ${target.id}`;
    expect(p).toEqual({ role: 'member', banned_at: null });
  });

  it('管理員也不能直接改別人的角色或負責縣市，也不能直接改自己的角色', async () => {
    const upd = await admin.client
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', target.id)
      .select();
    expect(upd.error === null ? upd.data : []).toEqual([]);
    const own = await admin.client.from('profiles').update({ role: 'member' }).eq('id', admin.id);
    expect(own.error).not.toBeNull();
    const ins = await admin.client
      .from('moderator_cities')
      .insert({ user_id: target.id, city: 'hsc' });
    expect(ins.error?.code).toBe('42501');
  });

  it('每個管理員操作都有紀錄，只有管理員讀得到', async () => {
    const { data } = await admin.client
      .from('admin_log')
      .select('action, actor, before, after')
      .eq('target', target.id)
      .order('id');
    expect(data?.map((r) => r.action)).toEqual([
      'set_role',
      'set_cities',
      'set_role',
      'ban',
      'unban',
    ]);
    expect(data?.every((r) => r.actor === admin.id)).toBe(true);
    expect(data?.[3]?.after).toEqual({ reason: '大量灌水' });
    expect((await modHsc.client.from('admin_log').select('id')).data).toEqual([]);
  });
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

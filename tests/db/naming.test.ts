// 會員命名（decisions D23）的權限與計票：用不同身分的 JWT 直接打資料庫（PostgREST＋RLS）。
// 前提：新竹市已上線（同 auth.test.ts）。只用 test- 開頭的待命名點與場地，跑完刪除。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actors, type Actor } from './auth-helpers';
import { adminSql, anonClient } from './helpers';
import { dropTestCity, ensureTestCity, TEST_CITY } from './test-city';

const sql = adminSql();
const people = actors(sql);
const anon = anonClient();

let seq = 0;
/** 建立一個待命名點（新竹市，已上線；或測試縣，未上線） */
async function candidate(city = 'hsc'): Promise<string> {
  const id = `test-naming-${process.pid}-${++seq}`;
  await sql`
    INSERT INTO naming_candidates (id, city, osm_ref, district, geom, nearby)
    VALUES (${id}, ${city}, ${`w${900000 + seq}`}, '東區', 'SRID=4326;POINT(120.97 24.80)',
            ${sql.json([{ name: '附近公園', kind: '公園', osm: 'w1', distance_m: 20 }])})`;
  return id;
}

const vote = (
  a: Actor,
  id: string,
  name: string | null,
  basis = 'OSM 地圖上可見的名稱',
  action = 'name',
) =>
  a.client.rpc('vote_naming', {
    p_candidate: id,
    p_action: action,
    p_name: name as string,
    p_basis: basis,
  });
const exclude = (a: Actor, id: string, reason = '私人社區') => vote(a, id, null, reason, 'exclude');
const resolve = (a: Actor, id: string, name: string, basis = '實地確認') =>
  a.client.rpc('resolve_naming', {
    p_candidate: id,
    p_action: 'name',
    p_name: name,
    p_basis: basis,
  });

let m1: Actor;
let m2: Actor;
let m3: Actor;
let m4: Actor;
let noTerms: Actor;
let banned: Actor;
let modHsc: Actor;
let modHsq: Actor;
let admin: Actor;

beforeAll(async () => {
  const [launched] = await sql`SELECT launched_at IS NOT NULL AS on FROM cities WHERE code = 'hsc'`;
  if (!launched?.on) throw new Error('新竹市要先上線：pnpm city launch hsc');
  await ensureTestCity(sql);
  [m1, m2, m3, m4, noTerms, banned, modHsc, modHsq, admin] = await Promise.all([
    people.create('member'),
    people.create('member'),
    people.create('member'),
    people.create('member'),
    people.create('member', { terms: false }),
    people.create('member', { banned: true }),
    people.create('moderator', { cities: ['hsc'] }),
    people.create('moderator', { cities: ['hsq'] }),
    people.create('admin'),
  ]);
});

afterAll(async () => {
  const made = (await sql`SELECT id FROM places WHERE id LIKE 'test-naming-%'`).map(
    (r) => r.id as string,
  );
  if (made.length) {
    await sql`DELETE FROM place_field_history WHERE place_id = ANY(${made})`;
    await sql`DELETE FROM places WHERE id = ANY(${made})`;
  }
  await sql`DELETE FROM naming_candidates WHERE id LIKE 'test-naming-%'`; // 票跟著刪
  await people.cleanup();
  await dropTestCity(sql);
  await sql.end();
});

const status = async (id: string) =>
  (
    await sql`SELECT status, resolved_name, resolved_by, resolved_basis FROM naming_candidates WHERE id = ${id}`
  )[0];

describe('誰可以投票', () => {
  it('未登入、沒同意條款、停權都不能投票', async () => {
    const id = await candidate();
    const a = await anon.rpc('vote_naming', {
      p_candidate: id,
      p_action: 'name',
      p_name: '某公園',
      p_basis: '實地確認',
    });
    expect(a.error).not.toBeNull();
    expect((await vote(noTerms, id, '某公園')).error?.message).toContain('服務條款');
    expect((await vote(banned, id, '某公園')).error).not.toBeNull();
    expect(
      (await sql`SELECT count(*)::int AS n FROM naming_votes WHERE candidate_id = ${id}`)[0]!.n,
    ).toBe(0);
  });

  it('未上線縣市的點不能投票，也讀不到', async () => {
    const id = await candidate(TEST_CITY.code);
    expect((await vote(m1, id, '某公園')).error?.message).toContain('找不到');
    const { data } = await anon.from('naming_open').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('輸入檢查：Google、網址、空白名稱、不在清單的理由都擋下', async () => {
    const id = await candidate();
    expect((await vote(m1, id, '某公園', 'Google 地圖')).error?.message).toContain(
      '不可以用 Google',
    );
    expect((await vote(m1, id, 'https://maps.google.com/x')).error?.message).toContain('網址');
    expect((await vote(m1, id, '   ')).error?.message).toContain('請填名稱');
    expect((await exclude(m1, id, '我覺得不好')).error?.message).toContain('排除的理由');
  });
});

describe('計票：3 位會員提出相同名稱才通過', () => {
  it('2 人一致不通過；第 3 人（寫法不同但正規化後相同）通過，立刻建立場地', async () => {
    const id = await candidate();
    expect((await vote(m1, id, '東大 公園')).data).toBe('voted');
    expect((await vote(m2, id, '東大公園', '實地確認')).data).toBe('voted');
    expect((await status(id))!.status).toBe('open');
    // 匿名看得到參與人數，看不到名稱
    const open = await anon.from('naming_open').select('*').eq('id', id).single();
    expect(open.data?.votes).toBe(2);
    expect(JSON.stringify(open.data)).not.toContain('東大');

    expect((await vote(m3, id, '東大公園')).data).toBe('named'); // 全形空白、半形都視為相同
    const s = await status(id);
    expect(s).toMatchObject({ status: 'named', resolved_name: '東大公園', resolved_by: 'votes' });
    expect(s!.resolved_basis).toBe('OSM 地圖上可見的名稱');
    // 場地已經在地圖上（匿名讀得到），待命名清單不再公開
    const place = await anon.from('place_cards').select('id, name').eq('id', id).single();
    expect(place.data).toEqual({ id, name: '東大公園' });
    expect((await anon.from('naming_open').select('id').eq('id', id)).data).toEqual([]);
    expect(
      (await sql`SELECT created_from_naming FROM places WHERE id = ${id}`)[0]!.created_from_naming,
    ).toBe(true);
    // 已經決定的不能再投
    expect((await vote(m4, id, '別的名字')).error?.message).toContain('已經處理過');
  });

  it('同一個人改票只算一票；名稱不同的票不會加在一起', async () => {
    const id = await candidate();
    await vote(m1, id, '甲公園');
    await vote(m1, id, '甲公園');
    await vote(m2, id, '乙公園');
    expect((await vote(m3, id, '甲公園')).data).toBe('voted'); // 甲 2 人、乙 1 人
    expect((await vote(m2, id, '甲公園')).data).toBe('named'); // m2 改票 → 甲 3 人
    expect((await status(id))!.resolved_name).toBe('甲公園');
  });

  it('3 人建議排除（理由可以不同）→ 排除，不建立場地', async () => {
    const id = await candidate();
    await exclude(m1, id, '私人社區');
    await exclude(m2, id, '在學校或機關內');
    expect((await exclude(m3, id, '私人社區')).data).toBe('excluded');
    expect(await status(id)).toMatchObject({ status: 'excluded', resolved_basis: '私人社區' });
    expect((await sql`SELECT count(*)::int AS n FROM places WHERE id = ${id}`)[0]!.n).toBe(0);
  });

  it('縣市裡已經有同名場地時加上行政區', async () => {
    const [{ name } = { name: '' }] = await sql<
      { name: string }[]
    >`SELECT name FROM places WHERE city = 'hsc' LIMIT 1`;
    const id = await candidate();
    await resolve(admin, id, name);
    expect((await status(id))!.resolved_name).toBe(`${name}（東區）`);
  });
});

describe('票與清單的讀寫權限', () => {
  it('只看得到自己的票；匿名讀不到票', async () => {
    const id = await candidate();
    await vote(m1, id, '丙公園');
    await vote(m2, id, '丁公園');
    expect(
      (await m1.client.from('naming_votes').select('name').eq('candidate_id', id)).data,
    ).toEqual([{ name: '丙公園' }]);
    expect(
      (await anon.from('naming_votes').select('id').eq('candidate_id', id)).data ?? [],
    ).toEqual([]);
    // 負責縣市的審核員看得到全部；別的縣市的審核員看不到
    expect(
      (await modHsc.client.from('naming_votes').select('id').eq('candidate_id', id)).data,
    ).toHaveLength(2);
    expect(
      (await modHsq.client.from('naming_votes').select('id').eq('candidate_id', id)).data,
    ).toEqual([]);
  });

  it('任何身分都不能直接寫入待命名清單與票，也不能直接呼叫 apply_naming', async () => {
    const id = await candidate();
    for (const a of [m1, modHsc, admin]) {
      const ins = await a.client.from('naming_votes').insert({
        candidate_id: id,
        user_id: a.id,
        action: 'name',
        name: 'x',
        name_key: 'x',
        basis: '實地確認',
      });
      expect(ins.error).not.toBeNull();
      const upd = await a.client
        .from('naming_candidates')
        .update({ status: 'named' })
        .eq('id', id)
        .select();
      expect(upd.error !== null || upd.data?.length === 0).toBe(true);
      const apply = await a.client.rpc(
        'apply_naming' as never,
        {
          p_candidate: id,
          p_action: 'name',
          p_name: 'x',
          p_basis: '實地確認',
          p_by: 'moderator',
          p_user: a.id,
        } as never,
      );
      expect(apply.error).not.toBeNull();
    }
    expect((await status(id))!.status).toBe('open');
  });
});

describe('投過票的人看得到結果（我的貢獻）', () => {
  it('決定後，投過票的人讀得到結果；沒投票的會員讀不到', async () => {
    const id = await candidate();
    await vote(m1, id, '辛公園');
    await resolve(admin, id, '辛公園');
    const mine = await m1.client
      .from('naming_candidates')
      .select('status, resolved_name')
      .eq('id', id)
      .single();
    expect(mine.data).toEqual({ status: 'named', resolved_name: '辛公園' });
    expect((await m2.client.from('naming_candidates').select('id').eq('id', id)).data).toEqual([]);
  });
});

describe('審核員直接決定', () => {
  it('會員不能用；別的縣市的審核員不能用；負責的審核員與管理員可以（不用滿 3 票）', async () => {
    const a = await candidate();
    expect((await resolve(m1, a, '戊公園')).error?.message).toContain('沒有審核權限');
    expect((await resolve(modHsq, a, '戊公園')).error?.message).toContain('沒有審核權限');
    expect((await resolve(modHsc, a, '戊公園')).error).toBeNull();
    expect(await status(a)).toMatchObject({ status: 'named', resolved_by: 'moderator' });

    const b = await candidate();
    const ex = await modHsc.client.rpc('resolve_naming', {
      p_candidate: b,
      p_action: 'exclude',
      p_name: null as unknown as string,
      p_basis: 'OSM 標錯／不是遊戲場',
    });
    expect(ex.error).toBeNull();
    expect((await status(b))!.status).toBe('excluded');
    expect((await resolve(admin, await candidate(), '己公園')).error).toBeNull();
  });
});

describe('每天上限', () => {
  it('一天超過 100 票就擋下', async () => {
    const id = await candidate();
    // 直接灌 100 筆今天的票（不同的待命名點）
    const ids = Array.from({ length: 100 }, (_, i) => `test-naming-${process.pid}-bulk-${i}`);
    await sql`
      INSERT INTO naming_candidates (id, city, osm_ref, geom)
      SELECT x, 'hsc', 'w1', 'SRID=4326;POINT(120.97 24.80)' FROM unnest(${ids}::text[]) x`;
    await sql`
      INSERT INTO naming_votes (candidate_id, user_id, action, name, name_key, basis)
      SELECT x, ${m4.id}, 'name', 'x', 'x', '實地確認' FROM unnest(${ids}::text[]) x`;
    expect((await vote(m4, id, '庚公園')).error?.message).toContain('上限');
  });
});

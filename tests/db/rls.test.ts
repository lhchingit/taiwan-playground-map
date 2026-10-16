// RLS 初版：匿名使用者只能讀、不能寫；未上線縣市的場地、屬性、停車都讀不到。
// 前提：supabase db reset && pnpm seed 已經跑過
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeedFile } from '@/types/place';
import fixture from '../fixtures/seed-test.json';
import { dropTestCity, ensureTestCity } from './test-city';
import { toSeedRows } from '../../scripts/seed/transform';
import { adminSql, anonClient } from './helpers';

const sql = adminSql();
const anon = anonClient();

const TABLES = [
  'cities',
  'places',
  'attribute_defs',
  'sources',
  'place_attributes',
  'place_parking',
  'edit_suggestions',
] as const;

/** 每張表內容的雜湊，用來確認匿名操作沒有改到任何資料 */
async function checksums() {
  const out: Record<string, string | null> = {};
  for (const t of TABLES) {
    const [r] =
      await sql`SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h FROM ${sql(t)} x`;
    out[t] = r?.h ?? null;
  }
  return out;
}

afterAll(() => sql.end());

describe('匿名使用者不能寫入', () => {
  let before: Record<string, string | null>;
  beforeAll(async () => {
    before = await checksums();
  });
  afterAll(async () => {
    expect(await checksums()).toEqual(before);
  });

  const park = 'hsc-hsinchu-park';
  const cases = [
    {
      table: 'cities',
      insert: { code: 'tst', slug: 'test', name: '測試' },
      match: { code: 'hsc' },
      update: { name: '改名' },
    },
    {
      table: 'places',
      insert: { id: 'test-anon', name: '測試', city: 'hsc', geom: 'SRID=4326;POINT(121 24.8)' },
      match: { id: park },
      update: { name: '改名' },
    },
    {
      table: 'attribute_defs',
      insert: { key: 'test_attr', label: '測試', category: 'play' },
      match: { key: 'slide' },
      update: { label: '改名' },
    },
    {
      table: 'sources',
      insert: { id: 'test-src', label: '測試', kind: 'user' },
      match: { id: 'hccg' },
      update: { label: '改名' },
    },
    {
      table: 'place_attributes',
      insert: {
        place_id: park,
        key: 'skatepark',
        value: 'y',
        source_id: 'lead',
        verified_at: '2026-10-10',
      },
      match: { place_id: park, key: 'sandpit' },
      update: { value: 'n' },
    },
    {
      table: 'place_parking',
      insert: { place_id: park, type: 'lot', fee: 'free' },
      match: { place_id: park },
      update: { type: 'none' },
    },
    {
      table: 'edit_suggestions',
      insert: { place_id: park, key: 'skatepark', proposed: 'y' },
      match: { place_id: park },
      update: { status: 'accepted' },
    },
    // 公開的 view 只能讀；city_bounds 以擁有者權限執行，若能寫入會繞過 RLS
    {
      table: 'city_bounds',
      insert: { code: 'tst', slug: 'test', name: '測試' },
      match: { code: 'hsq' },
      update: { name: '改名', bbox: [0, 0, 1, 1] },
    },
    {
      table: 'place_cards',
      insert: { id: 'test-anon', name: '測試', city: 'hsc' },
      match: { id: park },
      update: { name: '改名' },
    },
  ] as const;

  // supabase-js 的表名型別是字面值聯集，這裡逐表測試，用寬鬆型別呼叫
  const from = (t: string) =>
    (anon as unknown as ReturnType<typeof anonClient>).from(t as 'places');

  for (const c of cases) {
    it(`${c.table}：新增失敗`, async () => {
      const { error } = await from(c.table).insert(c.insert as never);
      // 42501：違反 RLS 或沒有權限；55000：view 本身不能寫入（Postgres 先檢查這個才檢查權限）
      expect(['42501', '55000']).toContain(error?.code);
    });

    it(`${c.table}：修改不到任何一列`, async () => {
      const { data, error } = await from(c.table)
        .update(c.update as never)
        .match(c.match)
        .select();
      expect(error === null ? data : []).toEqual([]);
    });

    it(`${c.table}：刪除不到任何一列`, async () => {
      const { data, error } = await from(c.table).delete().match(c.match).select();
      expect(error === null ? data : []).toEqual([]);
    });
  }
});

describe('縣市上線狀態控制匿名讀取（以測試縣 tst 測試：沒有真的資料、未上線）', () => {
  const rows = toSeedRows(fixture as SeedFile);
  const ids = rows.places.map((p) => p.id);

  const setLaunched = (on: boolean) =>
    sql`UPDATE cities SET launched_at = ${on ? sql`now()` : null} WHERE code = 'tst'`;

  async function anonSees() {
    const places = await anon.from('places').select('id').in('id', ids);
    const attrs = await anon.from('place_attributes').select('place_id').in('place_id', ids);
    const parking = await anon.from('place_parking').select('place_id').in('place_id', ids);
    const city = await anon.from('cities').select('code').eq('code', 'tst');
    const cards = await anon.from('place_cards').select('id').in('id', ids);
    for (const r of [places, attrs, parking, city, cards]) expect(r.error).toBeNull();
    return {
      places: places.data?.length,
      attrs: attrs.data?.length,
      parking: parking.data?.length,
      city: city.data?.length,
      cards: cards.data?.length,
    };
  }

  beforeAll(async () => {
    await ensureTestCity(sql);
    for (const p of rows.places) {
      await sql`INSERT INTO places (id, name, city, geom)
                VALUES (${p.id}, ${p.name}, ${p.city}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))`;
    }
    await sql`INSERT INTO place_attributes ${sql(rows.placeAttributes)}`;
    await sql`INSERT INTO place_parking ${sql(rows.parking)}`;
  });

  afterAll(async () => {
    await sql`DELETE FROM places WHERE id = ANY(${ids})`;
    await sql`DELETE FROM place_attribute_history WHERE place_id = ANY(${ids})`;
    await dropTestCity(sql);
  });

  const hidden = { places: 0, attrs: 0, parking: 0, city: 0, cards: 0 };

  it('未上線時（launched_at 為 NULL）讀不到場地、屬性、停車、縣市與 place_cards', async () => {
    expect(await anonSees()).toEqual(hidden);
  });

  it('上線後讀得到', async () => {
    await setLaunched(true);
    expect(await anonSees()).toEqual({
      places: 2,
      attrs: rows.placeAttributes.length,
      parking: 2,
      city: 1,
      cards: 2,
    });
  });

  it('設回 NULL 後又讀不到', async () => {
    await setLaunched(false);
    expect(await anonSees()).toEqual(hidden);
  });

  it('未上線時 city_bounds 仍看得到範圍（前端靠它判斷要不要載入）', async () => {
    const { data, error } = await anon.from('city_bounds').select('*').eq('code', 'tst');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ code: 'tst', slug: 'test-city', launched: false }),
    ]);
    expect(data?.[0]?.bbox).toHaveLength(4);
  });
});

describe('首頁用的公開 view', () => {
  it('匿名與登入使用者對 view 只有讀取權限', async () => {
    const rows = await sql`
      SELECT r AS role, v AS view, p AS privilege, has_table_privilege(r, v, p) AS granted
      FROM unnest(array['anon', 'authenticated']) r,
           unnest(array['city_bounds', 'place_cards']) v,
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p`;
    for (const r of rows)
      expect([r.role, r.view, r.privilege, r.granted]).toEqual([
        r.role,
        r.view,
        r.privilege,
        r.privilege === 'SELECT',
      ]);
  });

  it('city_bounds：17 個縣市都有範圍，只公開這幾個欄位（測試縣不在 migration 裡）', async () => {
    const { data, error } = await anon.from('city_bounds').select('*').order('code');
    expect(error).toBeNull();
    expect(data?.map((c) => [c.code, c.launched])).toEqual([
      ['chw', false],
      ['cyi', false],
      ['cyq', false],
      ['hsc', true],
      ['hsq', false],
      ['hua', false],
      ['ila', false],
      ['khh', false],
      ['mlc', false],
      ['nan', false],
      ['nwt', false],
      ['pif', false],
      ['tnn', false],
      ['tpe', false],
      ['txg', false],
      ['tyc', false],
      ['yun', false],
    ]);
    for (const c of data ?? []) {
      expect(Object.keys(c).sort()).toEqual(['bbox', 'code', 'launched', 'name', 'slug']);
      expect(c.bbox).toHaveLength(4);
    }
  });

  it('place_cards：新竹市全部場地，座標、attrs、停車都正確', async () => {
    const total = (
      JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as { places: unknown[] }
    ).places.length;
    const { data, error } = await anon.from('place_cards').select('*').eq('city', 'hsc');
    expect(error).toBeNull();
    expect(data).toHaveLength(total);
    const byId = new Map(data?.map((p) => [p.id, p]));
    const park = byId.get('hsc-hsinchu-park');
    expect(park?.lat).toBeCloseTo(24.799191, 6);
    expect(park?.lng).toBeCloseTo(120.977891, 6);
    expect((park?.attrs as Record<string, string>).sandpit).toBe('y');
    expect(park?.parking).toEqual({ type: 'u', fee: 'u', spaces: null });
    expect(byId.get('hsc-nanliao-sand-water')?.parking).toEqual({
      type: 'lot',
      fee: 'paid',
      spaces: null,
    });
  });
});

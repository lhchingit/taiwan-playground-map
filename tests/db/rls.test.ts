// RLS 初版：匿名使用者只能讀、不能寫；未上線縣市的場地、屬性、停車都讀不到。
// 前提：supabase db reset && pnpm seed 已經跑過
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeedFile } from '@/types/place';
import fixture from '../fixtures/seed-test.json';
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
  ] as const;

  // supabase-js 的表名型別是字面值聯集，這裡逐表測試，用寬鬆型別呼叫
  const from = (t: string) =>
    (anon as unknown as ReturnType<typeof anonClient>).from(t as 'places');

  for (const c of cases) {
    it(`${c.table}：新增失敗`, async () => {
      const { error } = await from(c.table).insert(c.insert as never);
      expect(error?.code).toBe('42501'); // 違反 RLS
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

describe('縣市上線狀態控制匿名讀取（以新竹縣測試）', () => {
  const rows = toSeedRows(fixture as SeedFile);
  const ids = rows.places.map((p) => p.id);

  const setLaunched = (on: boolean) =>
    sql`UPDATE cities SET launched_at = ${on ? sql`now()` : null} WHERE code = 'hsq'`;

  async function anonSees() {
    const places = await anon.from('places').select('id').in('id', ids);
    const attrs = await anon.from('place_attributes').select('place_id').in('place_id', ids);
    const parking = await anon.from('place_parking').select('place_id').in('place_id', ids);
    const city = await anon.from('cities').select('code').eq('code', 'hsq');
    for (const r of [places, attrs, parking, city]) expect(r.error).toBeNull();
    return {
      places: places.data?.length,
      attrs: attrs.data?.length,
      parking: parking.data?.length,
      city: city.data?.length,
    };
  }

  beforeAll(async () => {
    for (const p of rows.places) {
      await sql`INSERT INTO places (id, name, city, geom)
                VALUES (${p.id}, ${p.name}, ${p.city}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))`;
    }
    await sql`INSERT INTO place_attributes ${sql(rows.placeAttributes)}`;
    await sql`INSERT INTO place_parking ${sql(rows.parking)}`;
  });

  afterAll(async () => {
    await sql`DELETE FROM places WHERE id = ANY(${ids})`;
    await setLaunched(false);
  });

  it('未上線時（launched_at 為 NULL）讀不到場地、屬性、停車與縣市', async () => {
    expect(await anonSees()).toEqual({ places: 0, attrs: 0, parking: 0, city: 0 });
  });

  it('上線後讀得到', async () => {
    await setLaunched(true);
    expect(await anonSees()).toEqual({
      places: 2,
      attrs: rows.placeAttributes.length,
      parking: 2,
      city: 1,
    });
  });

  it('設回 NULL 後又讀不到', async () => {
    await setLaunched(false);
    expect(await anonSees()).toEqual({ places: 0, attrs: 0, parking: 0, city: 0 });
  });
});

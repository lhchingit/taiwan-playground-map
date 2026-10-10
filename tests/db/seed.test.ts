// 前提：supabase db reset && pnpm seed 已經跑過
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { readAttr, type SeedFile } from '@/types/place';
import { listSeedCities } from '../../scripts/seed/files';
import { boundsWithoutSeeds, loadOsmBounds } from '../../scripts/seed/osm-bounds';
import { runSeed } from '../../scripts/seed/run';
import { adminSql, anonClient } from './helpers';

const sql = adminSql();
const seed = JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as SeedFile;
// 筆數從種子資料算，補資料後不用改測試
const withArea = seed.places.filter((p) => p.area_ha !== null && p.area_ha !== undefined).length;

afterAll(() => sql.end());

async function snapshot() {
  const [s] = await sql`
    SELECT (SELECT count(*) FROM sources)::int AS sources,
           (SELECT count(*) FROM attribute_defs)::int AS attribute_defs,
           (SELECT count(*) FROM places)::int AS places,
           (SELECT count(*) FROM place_attributes)::int AS place_attributes,
           (SELECT count(*) FROM place_parking)::int AS place_parking,
           (SELECT max(updated_at) FROM places) AS places_updated,
           (SELECT array_agg(id ORDER BY id) FROM place_parking) AS parking_ids,
           (SELECT launched_at FROM cities WHERE code = 'hsc') AS hsc_launched`;
  return s;
}

describe('pnpm seed', () => {
  it('各表筆數符合完成標準', async () => {
    expect(await snapshot()).toMatchObject({
      sources: Object.keys(seed.sources).length,
      attribute_defs: 38,
      places: seed.places.length,
      place_parking: 72,
    });
  });

  it('attribute_defs：28 項遊樂設施（含分組）＋ 10 項生活機能', async () => {
    const rows = await sql`SELECT category, count(*)::int AS n, count(group_name)::int AS grouped
                           FROM attribute_defs GROUP BY category ORDER BY category`;
    expect(rows).toEqual([
      { category: 'amenity', n: 10, grouped: 0 },
      { category: 'play', n: 28, grouped: 28 },
    ]);
  });

  it('重跑不會改變任何資料（筆數、更新時間、停車 id、上線時間）', async () => {
    const before = await snapshot();
    await runSeed(sql, seed, boundsWithoutSeeds(loadOsmBounds(), listSeedCities()));
    expect(await snapshot()).toEqual(before);
  });

  it('新竹公園有沙坑；沒有滑板場的資料時 attrs 裡沒有這個 key（= 未知）', async () => {
    const [p] = await sql`
      SELECT attrs->>'sandpit' AS sandpit, attrs->>'skatepark' AS skatepark, attrs
      FROM places WHERE id = 'hsc-hsinchu-park'`;
    expect(p?.sandpit).toBe('y');
    expect(p?.skatepark).toBeNull();
    expect(readAttr(p?.attrs as Record<string, unknown>, 'skatepark')).toBe('u');
  });

  it('attrs 只放 y / n，且與 place_attributes 一致', async () => {
    const drift = await sql`
      SELECT p.id FROM places p
      LEFT JOIN (SELECT place_id, jsonb_object_agg(key, value) AS agg FROM place_attributes
                 WHERE value IN ('y', 'n') GROUP BY place_id) a ON a.place_id = p.id
      WHERE p.attrs IS DISTINCT FROM COALESCE(a.agg, '{}'::jsonb)`;
    expect(drift).toEqual([]);
  });

  it('寫入的每一筆屬性都有來源與確認日期', async () => {
    const [r] = await sql`SELECT count(*)::int AS n FROM place_attributes
                          WHERE source_id IS NULL OR verified_at IS NULL`;
    expect(r?.n).toBe(0);
  });

  it('每個場地剛好一列停車資料；已知的停車資料有來源', async () => {
    const rows = await sql`
      SELECT p.id, count(pp.id)::int AS n,
             count(*) FILTER (WHERE pp.type <> 'u' AND pp.source_id IS NULL)::int AS unsourced
      FROM places p LEFT JOIN place_parking pp ON pp.place_id = p.id GROUP BY p.id
      HAVING count(pp.id) <> 1 OR count(*) FILTER (WHERE pp.type <> 'u' AND pp.source_id IS NULL) > 0`;
    expect(rows).toEqual([]);
  });

  it('場地的 city 存縣市代碼；新竹市已上線並有範圍', async () => {
    const cities = await sql`SELECT DISTINCT city FROM places`;
    expect(cities.map((c) => c.city)).toEqual(['hsc']);
    const [hsc] = await sql`SELECT launched_at, bbox FROM cities WHERE code = 'hsc'`;
    expect(hsc?.launched_at).not.toBeNull();
    expect(hsc?.bbox).toHaveLength(4);
    const [others] =
      await sql`SELECT count(*)::int AS n FROM cities WHERE code <> 'hsc' AND launched_at IS NOT NULL`;
    expect(others?.n).toBe(0);
  });

  it('清冊新增的場地收費是未知（清冊沒有這項資訊，不推測）', async () => {
    const rows = await sql`
      SELECT coalesce(fee, 'null') AS fee, count(*)::int AS n FROM places
      WHERE id LIKE 'hsc-hccg-%' GROUP BY 1`;
    const hccg = seed.places.filter((p) => p.id.startsWith('hsc-hccg-')).length;
    expect(rows).toEqual([{ fee: 'null', n: hccg }]);
  });

  it('面積：來自公園管理維護地點（完全相同的名稱），其他是未知', async () => {
    const [r] = await sql`
      SELECT count(*) FILTER (WHERE area_ha IS NOT NULL)::int AS known,
             count(*) FILTER (WHERE area_ha IS NULL)::int AS unknown
      FROM places WHERE id NOT LIKE 'test-%'`;
    expect(r).toEqual({ known: withArea, unknown: seed.places.length - withArea });
    const [park] = await sql`SELECT area_ha::float8 AS a FROM places WHERE id = 'hsc-hsinchu-park'`;
    expect(park?.a).toBe(13.86);
  });

  it('公廁資料：名稱對到的場地廁所是「有」，有育嬰台的才設哺乳室；沒有寫入任何「無」', async () => {
    const expectedRows = seed.places.flatMap((p) =>
      (['toilet', 'nursing'] as const)
        .filter((k) => p.attrs[k]?.src === 'hccg_toilets')
        .map((k) => `${p.id}.${k}=${p.attrs[k]!.v}`),
    );
    const rows = await sql`
      SELECT place_id || '.' || key || '=' || value AS r FROM place_attributes
      WHERE source_id = 'hccg_toilets' ORDER BY place_id, key`;
    expect(rows.map((x) => x.r).sort()).toEqual(expectedRows.sort());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => String(x.r).endsWith('=y'))).toBe(true);
  });

  it('每個場地都有座標來源：OpenStreetMap 或人工定位（不可以是 Google）', async () => {
    const [r] = await sql`
      SELECT count(*) FILTER (WHERE coord_source IS NULL)::int AS missing,
             count(*) FILTER (WHERE coord_source ILIKE '%google%')::int AS google,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %'
                                AND coord_source NOT LIKE '人工定位（%')::int AS other
      FROM places WHERE id NOT LIKE 'test-%'`;
    expect(r).toEqual({ missing: 0, google: 0, other: 0 });
  });

  it('沒有場地的縣市也有範圍（OSM 行政界），前端才能判斷要不要載入', async () => {
    const osm = loadOsmBounds();
    const bounds = await sql`
      SELECT code, bbox::float8[] AS bbox FROM cities WHERE code <> 'hsc' ORDER BY code`;
    expect(bounds).toEqual(
      Object.keys(osm)
        .filter((c) => c !== 'hsc')
        .sort()
        .map((code) => ({ code, bbox: osm[code] })),
    );
  });

  it('匿名使用者讀得到新竹市全部場地', async () => {
    const { count, error } = await anonClient()
      .from('places')
      .select('id', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(72);
  });
});

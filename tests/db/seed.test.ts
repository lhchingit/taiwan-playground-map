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
// 全部縣市的種子資料（新竹市＋新竹縣…）；筆數從種子資料算，補資料後不用改測試
const seedCities = listSeedCities();
const allSeeds = seedCities.map(
  (c) => JSON.parse(readFileSync(`data/seed/${c}/places.json`, 'utf8')) as SeedFile,
);
const allPlaces = allSeeds.flatMap((s) => s.places);
const allSources = new Set(allSeeds.flatMap((s) => Object.keys(s.sources)));
const hsq = allSeeds.find((s) => s.places[0]?.city === 'hsq');
// 新竹市的面積
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
      // 'user'（使用者回報）由 migration 0004 建立，不在種子資料裡
      sources: new Set([...allSources, 'user']).size,
      attribute_defs: 38,
      places: allPlaces.length,
      // 每個場地剛好一列停車資料
      place_parking: allPlaces.length,
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

  it('場地的 city 存縣市代碼；新竹市已上線並有範圍，其他縣市都還沒上線', async () => {
    const cities = await sql`SELECT DISTINCT city FROM places ORDER BY city`;
    expect(cities.map((c) => c.city)).toEqual([...seedCities].sort());
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
      FROM places WHERE city = 'hsc' AND id NOT LIKE 'test-%'`;
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

  it('每個場地都有座標來源：OpenStreetMap、人工定位或政府開放資料（D21，不可以是 Google）', async () => {
    const [r] = await sql`
      SELECT count(*) FILTER (WHERE coord_source IS NULL)::int AS missing,
             count(*) FILTER (WHERE coord_source ILIKE '%google%')::int AS google,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %'
                                AND coord_source NOT LIKE '人工定位（%'
                                AND coord_source NOT LIKE '臺北市公園設施資料（%')::int AS other
      FROM places WHERE id NOT LIKE 'test-%'`;
    expect(r).toEqual({ missing: 0, google: 0, other: 0 });
  });

  it('沒有場地的縣市也有範圍（OSM 行政界），前端才能判斷要不要載入', async () => {
    const osm = loadOsmBounds();
    const bounds = await sql`
      SELECT code, bbox::float8[] AS bbox FROM cities WHERE NOT (code = ANY(${seedCities})) ORDER BY code`;
    expect(bounds).toEqual(
      Object.keys(osm)
        .filter((c) => !seedCities.includes(c))
        .sort()
        .map((code) => ({ code, bbox: osm[code] })),
    );
  });

  it('重新匯入不覆蓋使用者回報（已審核）的開放時間、地面材質、狀態', async () => {
    const target = seed.places[0]!;
    const [before] =
      await sql`SELECT hours, surface, status, updated_at FROM places WHERE id = ${target.id}`;
    await sql`UPDATE places SET hours = '使用者時間', hours_source = 'user', surface = '使用者地面', surface_source = 'user',
                               status = 'maintenance', status_source = 'user'
              WHERE id = ${target.id}`;
    try {
      await runSeed(sql, seed);
      const [after] = await sql`SELECT hours, surface, status FROM places WHERE id = ${target.id}`;
      expect(after).toEqual({ hours: '使用者時間', surface: '使用者地面', status: 'maintenance' });
      // 再匯入一次也不會再更新（不會每次都改 updated_at）
      const [t1] = await sql`SELECT updated_at FROM places WHERE id = ${target.id}`;
      await runSeed(sql, seed);
      const [t2] = await sql`SELECT updated_at FROM places WHERE id = ${target.id}`;
      expect(t2?.updated_at).toEqual(t1?.updated_at);
    } finally {
      await sql`UPDATE places SET hours = ${before!.hours}, surface = ${before!.surface}, status = ${before!.status},
                                 hours_source = NULL, surface_source = NULL, status_source = NULL,
                                 updated_at = ${before!.updated_at}
                WHERE id = ${target.id}`;
    }
  });

  it('由使用者建議建立的場地不在 places.json：不警告、--prune 也不刪除', async () => {
    const id = 'hsc-user-test';
    await sql`INSERT INTO places (id, name, city, geom, created_from_suggestion)
              VALUES (${id}, 'test-使用者新增', 'hsc', 'SRID=4326;POINT(120.97 24.8)', 1)`;
    try {
      const s = await runSeed(sql, seed, {}, { prune: true, dryRun: true });
      expect(s.orphanPlaces).not.toContain(id);
      expect(s.pruned).not.toContain(id);
    } finally {
      await sql`DELETE FROM places WHERE id = ${id}`;
    }
  });

  it('會員命名建立的場地（decisions D23）不在 places.json：不警告、--prune 也不刪除', async () => {
    const id = 'hsc-osm-w1';
    await sql`INSERT INTO places (id, name, city, geom, created_from_naming)
              VALUES (${id}, 'test-會員命名', 'hsc', 'SRID=4326;POINT(120.97 24.8)', true)`;
    try {
      const s = await runSeed(sql, seed, {}, { prune: true, dryRun: true });
      expect(s.orphanPlaces).not.toContain(id);
      expect(s.pruned).not.toContain(id);
    } finally {
      await sql`DELETE FROM places WHERE id = ${id}`;
    }
  });

  it('待命名清單：新的加入；清單沒有、沒人投票的刪除；有人投過票的保留；已經成為場地的標成已命名', async () => {
    const pt = 'SRID=4326;POINT(120.97 24.8)';
    const [first] = seed.places;
    await sql`INSERT INTO naming_candidates (id, city, osm_ref, geom) VALUES
      ('hsc-osm-w11', 'hsc', 'w11', ${pt}), ('hsc-osm-w12', 'hsc', 'w12', ${pt}),
      (${first!.id}, 'hsc', 'w13', ${pt})`;
    await sql`INSERT INTO naming_votes (candidate_id, action, name, name_key, basis)
              VALUES ('hsc-osm-w12', 'name', 'x', 'x', '實地確認')`;
    try {
      const s = await runSeed(
        sql,
        seed,
        {},
        {
          dryRun: true,
          naming: [
            {
              id: 'hsc-osm-w10',
              city: 'hsc',
              osm_ref: 'w10',
              district: '東區',
              lat: 24.8,
              lng: 120.97,
              nearby: [],
            },
          ],
        },
      );
      expect(s.changes).toMatchObject({
        naming_upserted: 1,
        naming_deleted: 1,
        naming_imported: 1,
      });
      expect(s.naming).toEqual({ open: 2, kept: ['hsc-osm-w12'] });
    } finally {
      await sql`DELETE FROM naming_candidates WHERE id IN ('hsc-osm-w11', 'hsc-osm-w12', ${first!.id})`;
    }
  });

  it('新竹縣（OpenStreetMap，decisions D20）：未上線、座標來自 OSM、屬性全是未知', async () => {
    expect(hsq?.places.length).toBeGreaterThan(0);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE attrs <> '{}'::jsonb)::int AS with_attrs,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %')::int AS not_osm
      FROM places WHERE city = 'hsq' AND id NOT LIKE 'test-%'`;
    expect(r).toEqual({ n: hsq!.places.length, with_attrs: 0, not_osm: 0 });
    const [a] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'hsq-osm-%'`;
    expect(a?.n).toBe(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'hsq'`;
    expect(c?.launched_at).toBeNull();
    const pub = await anonClient().from('places').select('id').eq('city', 'hsq');
    expect(pub.data).toEqual([]);
  });

  it('苗栗縣（OpenStreetMap，decisions D20）：未上線、座標來自 OSM、屬性全是未知', async () => {
    const mlc = allSeeds.find((s) => s.places[0]?.city === 'mlc');
    expect(mlc?.places.length).toBeGreaterThan(0);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %')::int AS not_osm
      FROM places WHERE city = 'mlc'`;
    expect(r).toEqual({ n: mlc!.places.length, not_osm: 0 });
    const [a] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'mlc-%'`;
    expect(a?.n).toBe(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'mlc'`;
    expect(c?.launched_at).toBeNull();
  });

  it('新北市（OpenStreetMap，decisions D20）：未上線、座標來自 OSM、屬性全是未知', async () => {
    const nwt = allSeeds.find((s) => s.places[0]?.city === 'nwt');
    expect(nwt?.places.length).toBeGreaterThan(0);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %')::int AS not_osm
      FROM places WHERE city = 'nwt'`;
    expect(r).toEqual({ n: nwt!.places.length, not_osm: 0 });
    const [a] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'nwt-%'`;
    expect(a?.n).toBe(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'nwt'`;
    expect(c?.launched_at).toBeNull();
  });

  it('高雄市（OpenStreetMap，decisions D20）：未上線、座標來自 OSM、屬性全是未知', async () => {
    const khh = allSeeds.find((s) => s.places[0]?.city === 'khh');
    expect(khh?.places.length).toBeGreaterThan(0);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %')::int AS not_osm
      FROM places WHERE city = 'khh'`;
    expect(r).toEqual({ n: khh!.places.length, not_osm: 0 });
    const [a] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'khh-%'`;
    expect(a?.n).toBe(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'khh'`;
    expect(c?.launched_at).toBeNull();
  });

  it('臺中市（OpenStreetMap，decisions D20）：未上線、座標來自 OSM、屬性全是未知', async () => {
    const txg = allSeeds.find((s) => s.places[0]?.city === 'txg');
    expect(txg?.places.length).toBeGreaterThan(0);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE coord_source NOT LIKE 'OpenStreetMap %')::int AS not_osm
      FROM places WHERE city = 'txg'`;
    expect(r).toEqual({ n: txg!.places.length, not_osm: 0 });
    const [a] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'txg-%'`;
    expect(a?.n).toBe(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'txg'`;
    expect(c?.launched_at).toBeNull();
  });

  it('臺北市（公園處設施資料，decisions D21）：未上線；遊具只有「有」或未知，沒有「無」', async () => {
    const tpe = allSeeds.find((s) => s.places[0]?.city === 'tpe');
    expect(tpe?.places.length).toBeGreaterThan(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'tpe'`;
    expect(c?.launched_at).toBeNull();
    const values = await sql`SELECT DISTINCT value, source_id FROM place_attributes
                             WHERE place_id LIKE 'tpe-%' ORDER BY 1`;
    expect(values).toEqual([{ value: 'y', source_id: 'pkl' }]);
    const [r] = await sql`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE coord_source NOT LIKE '臺北市公園設施資料%')::int AS other
      FROM places WHERE city = 'tpe'`;
    expect(r).toEqual({ n: tpe!.places.length, other: 0 });
  });

  it('桃園市（桃園市公園資料）：未上線；廁所、停車只有「有」或未知，沒有「無」', async () => {
    const tyc = allSeeds.find((s) => s.places[0]?.city === 'tyc');
    expect(tyc?.places.length).toBeGreaterThan(0);
    const [c] = await sql`SELECT launched_at FROM cities WHERE code = 'tyc'`;
    expect(c?.launched_at).toBeNull();
    const toilet = await sql`SELECT DISTINCT value, source_id FROM place_attributes
                             WHERE place_id LIKE 'tyc-%' AND key = 'toilet'`;
    expect(toilet).toEqual([{ value: 'y', source_id: 'tycg' }]);
    const [n] =
      await sql`SELECT count(*)::int AS n FROM place_attributes WHERE place_id LIKE 'tyc-%' AND value = 'n'`;
    expect(n?.n).toBe(0);
    const parking =
      await sql`SELECT DISTINCT type, source_id FROM place_parking WHERE place_id LIKE 'tyc-%'
                              ORDER BY source_id NULLS LAST`;
    expect(parking).toEqual([
      { type: 'u', source_id: 'tycg' },
      { type: 'u', source_id: null },
    ]);
    const pub = await anonClient().from('places').select('id').eq('city', 'tyc');
    expect(pub.data).toEqual([]);
  });

  it('匿名使用者讀得到新竹市全部場地', async () => {
    const { count, error } = await anonClient()
      .from('places')
      .select('id', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(72);
  });
});

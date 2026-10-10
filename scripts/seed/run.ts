// 把 places.json 寫進資料庫。整個流程在同一個交易裡，任何一步失敗就全部回滾。
// 可以重複執行：只有內容有變的列才會更新，重跑不會產生重複資料，也不會觸發多餘的 attrs 同步。
import type { Sql } from 'postgres';
import type { SeedFile } from '../../src/types/place';
import { toSeedRows } from './transform';

/** seed 時設為已上線的縣市（decisions D12）；其他縣市的 launched_at 保持原狀 */
export const LAUNCHED_CITIES = ['hsc'];

/** 使用者回報（P3）寫入的資料，seed 不可以覆蓋或刪除 */
const USER_SOURCE = 'user';

export interface SeedSummary {
  counts: Record<string, number>;
  knownAttrs: { id: string; name: string; y: number; n: number }[];
  bboxes: { code: string; bbox: number[] }[];
  /** 資料庫裡有、places.json 沒有的場地（不自動刪除，交給人工確認） */
  orphanPlaces: string[];
}

export async function runSeed(db: Sql, seed: SeedFile): Promise<SeedSummary> {
  const rows = toSeedRows(seed);
  const placeIds = rows.places.map((p) => p.id);
  const seedCities = rows.cities.map((c) => c.code);

  return db.begin(async (sql) => {
    // 1. 來源
    await sql`
      INSERT INTO sources (id, label, url, kind)
      SELECT id, label, url, kind FROM jsonb_to_recordset(${sql.json(rows.sources)})
        AS x(id text, label text, url text, kind text)
      ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, url = EXCLUDED.url, kind = EXCLUDED.kind
      WHERE (sources.label, sources.url, sources.kind)
        IS DISTINCT FROM (EXCLUDED.label, EXCLUDED.url, EXCLUDED.kind)`;

    // 2. 屬性字典
    await sql`
      INSERT INTO attribute_defs (key, label, category, group_name, sort_order)
      SELECT key, label, category, group_name, sort_order
      FROM jsonb_to_recordset(${sql.json(rows.attributeDefs)})
        AS x(key text, label text, category text, group_name text, sort_order smallint)
      ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category,
        group_name = EXCLUDED.group_name, sort_order = EXCLUDED.sort_order
      WHERE (attribute_defs.label, attribute_defs.category, attribute_defs.group_name, attribute_defs.sort_order)
        IS DISTINCT FROM (EXCLUDED.label, EXCLUDED.category, EXCLUDED.group_name, EXCLUDED.sort_order)`;

    // 3. 縣市範圍與上線時間（launched_at 只在 NULL 時設定，重跑不改）
    for (const c of rows.cities) {
      await sql`
        UPDATE cities SET bbox = ${c.bbox}::numeric[]
        WHERE code = ${c.code} AND bbox IS DISTINCT FROM ${c.bbox}::numeric[]`;
    }
    await sql`
      UPDATE cities SET launched_at = now()
      WHERE code = ANY(${LAUNCHED_CITIES}) AND launched_at IS NULL`;

    // 4. 場地（attrs 不寫，由 place_attributes 的 trigger 同步）
    await sql`
      INSERT INTO places (id, name, city, district, address, geom, size_class, stay_bucket, stay_source,
                          age_min, age_max, fee, indoor, hours, surface, status, summary)
      SELECT id, name, city, district, address,
             ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
             size_class, stay_bucket, stay_source, age_min, age_max, fee, indoor, hours, surface, status, summary
      FROM jsonb_to_recordset(${sql.json(rows.places)}) AS x(
        id text, name text, city text, district text, address text, lat float8, lng float8,
        size_class char(1), stay_bucket text, stay_source text, age_min smallint, age_max smallint,
        fee text, indoor boolean, hours text, surface text, status text, summary text)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, city = EXCLUDED.city, district = EXCLUDED.district, address = EXCLUDED.address,
        geom = EXCLUDED.geom, size_class = EXCLUDED.size_class, stay_bucket = EXCLUDED.stay_bucket,
        stay_source = EXCLUDED.stay_source, age_min = EXCLUDED.age_min, age_max = EXCLUDED.age_max,
        fee = EXCLUDED.fee, indoor = EXCLUDED.indoor, hours = EXCLUDED.hours, surface = EXCLUDED.surface,
        status = EXCLUDED.status, summary = EXCLUDED.summary, updated_at = now()
      WHERE (places.name, places.city, places.district, places.address, ST_AsEWKT(places.geom),
             places.size_class, places.stay_bucket, places.stay_source, places.age_min, places.age_max,
             places.fee, places.indoor, places.hours, places.surface, places.status, places.summary)
        IS DISTINCT FROM
            (EXCLUDED.name, EXCLUDED.city, EXCLUDED.district, EXCLUDED.address, ST_AsEWKT(EXCLUDED.geom),
             EXCLUDED.size_class, EXCLUDED.stay_bucket, EXCLUDED.stay_source, EXCLUDED.age_min, EXCLUDED.age_max,
             EXCLUDED.fee, EXCLUDED.indoor, EXCLUDED.hours, EXCLUDED.surface, EXCLUDED.status, EXCLUDED.summary)`;

    // 5. 屬性：先刪掉 places.json 已經沒有的列（不動使用者回報的資料），再 upsert
    await sql`
      DELETE FROM place_attributes a
      WHERE a.place_id = ANY(${placeIds})
        AND a.source_id IS DISTINCT FROM ${USER_SOURCE}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${sql.json(rows.placeAttributes)}) AS x(place_id text, key text)
          WHERE x.place_id = a.place_id AND x.key = a.key)`;
    await sql`
      INSERT INTO place_attributes (place_id, key, value, note, source_id, verified_at)
      SELECT place_id, key, value, note, source_id, verified_at
      FROM jsonb_to_recordset(${sql.json(rows.placeAttributes)}) AS x(
        place_id text, key text, value char(1), note text, source_id text, verified_at date)
      ON CONFLICT (place_id, key) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note,
        source_id = EXCLUDED.source_id, verified_at = EXCLUDED.verified_at
      WHERE place_attributes.source_id IS DISTINCT FROM ${USER_SOURCE}
        AND (place_attributes.value, place_attributes.note, place_attributes.source_id, place_attributes.verified_at)
          IS DISTINCT FROM (EXCLUDED.value, EXCLUDED.note, EXCLUDED.source_id, EXCLUDED.verified_at)`;

    // 6. 停車：每個場地維持一列 seed 資料（表沒有自然鍵，所以分三步，重跑時 id 不變）
    const parking = sql.json(rows.parking);
    const parkingCols = sql`AS x(place_id text, type text, fee text, spaces int, note text, source_id text, verified_at date)`;
    //   a. 不是剛好一列的（0 列或多列）先清掉
    await sql`
      DELETE FROM place_parking pp
      WHERE pp.place_id = ANY(${placeIds}) AND pp.source_id IS DISTINCT FROM ${USER_SOURCE}
        AND (SELECT count(*) FROM place_parking o
             WHERE o.place_id = pp.place_id AND o.source_id IS DISTINCT FROM ${USER_SOURCE}) <> 1`;
    //   b. 剩下的一列有變才更新
    await sql`
      UPDATE place_parking pp SET type = x.type, fee = x.fee, spaces = x.spaces, note = x.note,
        source_id = x.source_id, verified_at = x.verified_at
      FROM jsonb_to_recordset(${parking}) ${parkingCols}
      WHERE pp.place_id = x.place_id AND pp.source_id IS DISTINCT FROM ${USER_SOURCE}
        AND (pp.type, pp.fee, pp.spaces, pp.note, pp.source_id, pp.verified_at)
          IS DISTINCT FROM (x.type, x.fee, x.spaces, x.note, x.source_id, x.verified_at)`;
    //   c. 沒有的補上
    await sql`
      INSERT INTO place_parking (place_id, type, fee, spaces, note, source_id, verified_at)
      SELECT x.place_id, x.type, x.fee, x.spaces, x.note, x.source_id, x.verified_at
      FROM jsonb_to_recordset(${parking}) ${parkingCols}
      WHERE NOT EXISTS (SELECT 1 FROM place_parking pp
                        WHERE pp.place_id = x.place_id AND pp.source_id IS DISTINCT FROM ${USER_SOURCE})`;

    // 7. 檢查 places.attrs 與 place_attributes 一致（trigger 負責同步，這裡只驗證）
    const drift = await sql<{ id: string }[]>`
      SELECT p.id FROM places p
      LEFT JOIN (SELECT place_id, jsonb_object_agg(key, value) AS agg FROM place_attributes
                 WHERE value IN ('y', 'n') GROUP BY place_id) a ON a.place_id = p.id
      WHERE p.attrs IS DISTINCT FROM COALESCE(a.agg, '{}'::jsonb)`;
    if (drift.length > 0) {
      throw new Error(
        `places.attrs 與 place_attributes 不一致：${drift.map((d) => d.id).join(', ')}`,
      );
    }

    // 8. 摘要
    const [counts] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*) FROM sources)::int AS sources,
             (SELECT count(*) FROM attribute_defs)::int AS attribute_defs,
             (SELECT count(*) FROM places)::int AS places,
             (SELECT count(*) FROM place_attributes)::int AS place_attributes,
             (SELECT count(*) FROM place_parking)::int AS place_parking`;
    const knownAttrs = await sql<{ id: string; name: string; y: number; n: number }[]>`
      SELECT p.id, p.name,
             count(*) FILTER (WHERE a.value = 'y')::int AS y,
             count(*) FILTER (WHERE a.value = 'n')::int AS n
      FROM places p LEFT JOIN place_attributes a ON a.place_id = p.id
      WHERE p.id = ANY(${placeIds})
      GROUP BY p.id, p.name ORDER BY y DESC, p.id`;
    const bboxes = await sql<{ code: string; bbox: number[] }[]>`
      SELECT code, bbox::float8[] AS bbox FROM cities WHERE code = ANY(${seedCities}) ORDER BY code`;
    const orphans = await sql<{ id: string }[]>`
      SELECT id FROM places
      WHERE city = ANY(${seedCities}) AND NOT (id = ANY(${placeIds})) AND id NOT LIKE 'test-%'
      ORDER BY id`;

    return { counts: counts ?? {}, knownAttrs, bboxes, orphanPlaces: orphans.map((o) => o.id) };
  });
}

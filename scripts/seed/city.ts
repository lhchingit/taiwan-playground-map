// 縣市上線／下線（pnpm city）。上線前一定要先匯入並檢查資料（pnpm seed）。
// 上線狀態只存在 cities.launched_at；RLS 依它決定匿名使用者看不看得到這個縣市的資料。
import type { Sql } from 'postgres';

export interface CityStatus {
  code: string;
  name: string;
  slug: string;
  places: number;
  launchedAt: string | null;
  bbox: number[] | null;
}

export async function cityStatus(sql: Sql): Promise<CityStatus[]> {
  return sql<CityStatus[]>`
    SELECT c.code, c.name, c.slug, c.launched_at::text AS "launchedAt", c.bbox::float8[] AS bbox,
           (SELECT count(*) FROM places p WHERE p.city = c.code)::int AS places
    FROM cities c ORDER BY c.code`;
}

/** 上線。沒有場地的縣市拒絕上線；已經上線的不改時間。回傳上線時間。 */
export async function launchCity(sql: Sql, code: string): Promise<string> {
  const city = (await cityStatus(sql)).find((c) => c.code === code);
  if (!city)
    throw new Error(`沒有這個縣市：${code}（新增縣市要寫 migration，見 docs/operations.md）`);
  if (city.places === 0) {
    throw new Error(
      `${city.name}（${code}）還沒有任何場地，不能上線；先執行 pnpm seed --city ${code}`,
    );
  }
  const [row] = await sql<{ launchedAt: string }[]>`
    UPDATE cities SET launched_at = COALESCE(launched_at, now())
    WHERE code = ${code} RETURNING launched_at::text AS "launchedAt"`;
  return row?.launchedAt ?? '';
}

/** 下線：設回 NULL，RLS 立刻擋住這個縣市的場地、屬性與停車 */
export async function unlaunchCity(sql: Sql, code: string): Promise<void> {
  const r = await sql`UPDATE cities SET launched_at = NULL WHERE code = ${code}`;
  if (r.count === 0) throw new Error(`沒有這個縣市：${code}`);
}

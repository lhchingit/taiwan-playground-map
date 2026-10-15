// 測試用縣市 tst（測試縣）：只存在於測試裡，不在 migration，正式資料庫不會有這一列。
// 4 個真的縣市都有資料了，測試「沒有真的資料、未上線的縣市」改用它（tests/fixtures/seed-test.json 的場地都在這裡）。
// 測試中途當掉、沒有刪除也沒關係：tst 沒有上線，不會出現在公開頁面。
import type { Sql } from 'postgres';

export const TEST_CITY = { code: 'tst', slug: 'test-city', name: '測試縣' } as const;
// 涵蓋 seed-test.json 的測試場地：[西, 南, 東, 北]
const BBOX = [120.86, 24.67, 120.9, 24.71];

/** 建立測試縣（未上線）；已經存在就不動 */
export async function ensureTestCity(sql: Sql) {
  await sql`INSERT INTO cities (code, slug, name, bbox)
            VALUES (${TEST_CITY.code}, ${TEST_CITY.slug}, ${TEST_CITY.name}, ${BBOX})
            ON CONFLICT (code) DO NOTHING`;
}

/** 刪除測試縣，連同它的待命名點、場地與審核員負責縣市 */
export async function dropTestCity(sql: Sql) {
  await sql`DELETE FROM naming_candidates WHERE city = ${TEST_CITY.code}`;
  await sql`DELETE FROM places WHERE city = ${TEST_CITY.code}`;
  await sql`DELETE FROM moderator_cities WHERE city = ${TEST_CITY.code}`;
  await sql`DELETE FROM cities WHERE code = ${TEST_CITY.code}`;
}

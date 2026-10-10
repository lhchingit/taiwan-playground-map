// e2e 的預期筆數：讀標準答案（tests/fixtures/filter-cases.json，原型產生）與種子資料，不寫死。
// 出發點同樣是範例的新竹火車站。補資料後只要重新產生標準答案（pnpm regen:filter-cases）。
import { readFileSync } from 'node:fs';

interface Case {
  name: string;
  expected_ids: string[];
  expected_count: number;
  unknown_hint: number;
}

const fixture = JSON.parse(readFileSync('tests/fixtures/filter-cases.json', 'utf8')) as {
  cases: Case[];
};

/** 新竹市的場地總數 */
export const TOTAL = (
  JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as { places: unknown[] }
).places.length;

/** 依名稱取標準答案的案例（例如「沙坑＋廁所」） */
export function expected(name: string): Case {
  const c = fixture.cases.find((x) => x.name === name);
  if (!c) throw new Error(`filter-cases.json 沒有「${name}」這個案例`);
  return c;
}

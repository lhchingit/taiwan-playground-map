import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// supabase/migrations 裡 INSERT INTO cities 的縣市代碼（依 migration 順序）
const migrationCodes = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .flatMap((f) => {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    return [...sql.matchAll(/INSERT INTO cities[^;]*;/g)].flatMap((m) =>
      [...m[0].matchAll(/\(\s*'([a-z]{3})'\s*,/g)].map((c) => c[1]!),
    );
  });

// .github/workflows/data-ops.yml 的 city 選項（正式環境的匯入、上線只能選這些）
const workflow = readFileSync('.github/workflows/data-ops.yml', 'utf8');
const cityBlock = workflow.match(/^ {6}city:\n(?: {8}.*\n)*/m)?.[0] ?? '';
const options = (cityBlock.match(/options:\s*\[([^\]]*)\]/)?.[1] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

describe('資料作業（data-ops.yml）的縣市選項', () => {
  it('讀得到 migrations 的縣市與 workflow 的選項', () => {
    expect(migrationCodes.length).toBeGreaterThanOrEqual(20);
    expect(options.length).toBeGreaterThan(0);
  });

  it('跟 migrations 的縣市一致：新增縣市時忘了加，正式環境就沒辦法匯入、上線', () => {
    expect([...options].sort()).toEqual([...migrationCodes].sort());
  });
});

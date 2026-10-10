// pnpm seed 的試跑、上線／下線（scripts/seed/run.ts、scripts/seed/city.ts）
// 前提：supabase db reset && pnpm seed && pnpm city launch hsc 已經跑過
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import type { SeedFile } from '@/types/place';
import fixture from '../fixtures/seed-test.json';
import { cityStatus, launchCity, unlaunchCity } from '../../scripts/seed/city';
import { runSeed } from '../../scripts/seed/run';
import { toSeedRows } from '../../scripts/seed/transform';
import { adminSql } from './helpers';

const sql = adminSql();
afterAll(() => sql.end());

/** 各表內容的雜湊，用來確認試跑後什麼都沒變 */
async function fingerprint() {
  const out: Record<string, string | null> = {};
  for (const t of [
    'sources',
    'attribute_defs',
    'cities',
    'places',
    'place_attributes',
    'place_parking',
  ]) {
    const [r] =
      await sql`SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS h FROM ${sql(t)} x`;
    out[t] = r?.h ?? null;
  }
  return out;
}

describe('pnpm seed --dry-run', () => {
  it('回報會改變什麼，但資料庫完全不變', async () => {
    const seed = JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as SeedFile;
    const changed = structuredClone(seed);
    changed.places[0]!.name = '改名測試';
    changed.places[0]!.attrs.zipline = { v: 'n', src: 'yam', note: null, at: '2026-10-10' };

    const before = await fingerprint();
    const s = await runSeed(sql, changed, {}, { dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.changes.places_upserted).toBe(1);
    expect(s.changes.place_attributes_upserted).toBe(1);
    expect(await fingerprint()).toEqual(before);
  });
});

describe('pnpm seed 不改上線狀態', () => {
  it('匯入前後 launched_at 相同', async () => {
    const seed = JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as SeedFile;
    const before = await sql`SELECT code, launched_at FROM cities ORDER BY code`;
    const s = await runSeed(sql, seed);
    expect(await sql`SELECT code, launched_at FROM cities ORDER BY code`).toEqual(before);
    expect(s.launched).toEqual([{ code: 'hsc', launchedAt: expect.any(String) }]);
  });
});

describe('pnpm city', () => {
  const rows = toSeedRows(fixture as SeedFile);
  const ids = rows.places.map((p) => p.id);

  afterAll(async () => {
    await sql`DELETE FROM places WHERE id = ANY(${ids})`;
    await sql`UPDATE cities SET launched_at = NULL WHERE code = 'hsq'`;
  });

  it('沒有場地的縣市不能上線', async () => {
    await expect(launchCity(sql, 'mlc')).rejects.toThrow('還沒有任何場地');
    const [mlc] = await sql`SELECT launched_at FROM cities WHERE code = 'mlc'`;
    expect(mlc?.launched_at).toBeNull();
  });

  it('不存在的縣市 → 丟錯', async () => {
    await expect(launchCity(sql, 'zzz')).rejects.toThrow('沒有這個縣市');
    await expect(unlaunchCity(sql, 'zzz')).rejects.toThrow('沒有這個縣市');
  });

  it('有場地後可以上線；再上線一次不改時間；下線後設回 NULL', async () => {
    for (const p of rows.places) {
      await sql`INSERT INTO places (id, name, city, geom)
                VALUES (${p.id}, ${p.name}, ${p.city}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326))`;
    }
    const first = await launchCity(sql, 'hsq');
    expect(first).not.toBe('');
    expect(await launchCity(sql, 'hsq')).toBe(first);

    const status = (await cityStatus(sql)).find((c) => c.code === 'hsq');
    expect(status).toMatchObject({ code: 'hsq', places: 2, launchedAt: first });

    await unlaunchCity(sql, 'hsq');
    const [hsq] = await sql`SELECT launched_at FROM cities WHERE code = 'hsq'`;
    expect(hsq?.launched_at).toBeNull();
  });
});

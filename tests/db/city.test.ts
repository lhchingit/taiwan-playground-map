// pnpm seed 的試跑、上線／下線（scripts/seed/run.ts、scripts/seed/city.ts）
// 前提：supabase db reset && pnpm seed && pnpm city launch hsc 已經跑過
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    await sql`DELETE FROM place_attribute_history WHERE place_id = ANY(${ids})`;
    await sql`UPDATE cities SET launched_at = NULL WHERE code = 'mlc'`;
  });

  // 苗栗縣：沒有真的資料（測試資料在下一個測試才放進去）
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
    const first = await launchCity(sql, 'mlc');
    expect(first).not.toBe('');
    expect(await launchCity(sql, 'mlc')).toBe(first);

    const status = (await cityStatus(sql)).find((c) => c.code === 'mlc');
    expect(status).toMatchObject({ code: 'mlc', places: 2, launchedAt: first });

    await unlaunchCity(sql, 'mlc');
    const [mlc] = await sql`SELECT launched_at FROM cities WHERE code = 'mlc'`;
    expect(mlc?.launched_at).toBeNull();
  });
});

describe('pnpm seed --prune（從種子資料拿掉的場地）', () => {
  const seed = JSON.parse(readFileSync('data/seed/hsc/places.json', 'utf8')) as SeedFile;
  const target = seed.places[seed.places.length - 1]!;
  const without = { ...seed, places: seed.places.filter((p) => p.id !== target.id) };
  let createdUserSource = false;
  let historyStart = 0;

  beforeAll(async () => {
    const [h] = await sql`SELECT COALESCE(max(id), 0)::int AS id FROM place_attribute_history`;
    historyStart = h?.id ?? 0;
  });

  afterAll(async () => {
    await sql`DELETE FROM place_attributes WHERE place_id = ${target.id} AND source_id = 'user'`;
    if (createdUserSource) await sql`DELETE FROM sources WHERE id = 'user'`;
    // 把刪掉的場地補回來
    await runSeed(sql, seed);
    // 這組測試刪除又補回場地、暫時寫入使用者資料，產生的修改紀錄一併清掉
    await sql`DELETE FROM place_attribute_history WHERE id > ${historyStart}`;
  });

  it('沒加 --prune 只列出、不刪除', async () => {
    const s = await runSeed(sql, without);
    expect(s.orphanPlaces).toEqual([target.id]);
    expect(s.pruned).toEqual([]);
    expect(await sql`SELECT 1 FROM places WHERE id = ${target.id}`).toHaveLength(1);
  });

  it('--dry-run --prune：列出會刪除的場地，資料完全不變', async () => {
    const before = await fingerprint();
    const s = await runSeed(sql, without, {}, { dryRun: true, prune: true });
    expect(s.pruned).toEqual([target.id]);
    expect(await fingerprint()).toEqual(before);
  });

  it('有使用者回報資料的場地拒絕刪除', async () => {
    const [has] = await sql`SELECT count(*)::int AS n FROM sources WHERE id = 'user'`;
    if (!has?.n) {
      await sql`INSERT INTO sources (id, label, kind) VALUES ('user', '使用者回報（測試）', 'user')`;
      createdUserSource = true;
    }
    await sql`INSERT INTO place_attributes (place_id, key, value, source_id, verified_at)
              VALUES (${target.id}, 'skatepark', 'y', 'user', '2026-10-11')
              ON CONFLICT (place_id, key) DO UPDATE SET source_id = 'user'`;
    const s = await runSeed(sql, without, {}, { prune: true });
    expect(s.pruned).toEqual([]);
    expect(s.pruneBlocked).toEqual([target.id]);
    expect(await sql`SELECT 1 FROM places WHERE id = ${target.id}`).toHaveLength(1);
    await sql`DELETE FROM place_attributes WHERE place_id = ${target.id} AND source_id = 'user'`;
  });

  it('--prune：刪除場地，屬性與停車一起刪', async () => {
    const s = await runSeed(sql, without, {}, { prune: true });
    expect(s.pruned).toEqual([target.id]);
    expect(s.changes.places_pruned).toBe(1);
    expect(await sql`SELECT 1 FROM places WHERE id = ${target.id}`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM place_parking WHERE place_id = ${target.id}`).toHaveLength(0);
  });
});

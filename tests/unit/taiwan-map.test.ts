import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import map from '@/lib/taiwan-map.json';

// supabase/migrations 裡 INSERT INTO cities 的縣市名稱
const migrationNames = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .flatMap((f) => {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    return [...sql.matchAll(/INSERT INTO cities[^;]*;/g)].flatMap((m) =>
      [...m[0].matchAll(/'([^']+[縣市])'/g)].map((n) => n[1]!),
    );
  });

describe('首頁台灣地圖（src/lib/taiwan-map.json）', () => {
  const [, , width, height] = map.viewBox as [number, number, number, number];

  it('22 個縣市都有區塊，名稱不重複', () => {
    expect(map.counties).toHaveLength(22);
    expect(new Set(map.counties.map((c) => c.name)).size).toBe(22);
  });

  it('每個區塊都有路徑，名稱位置在地圖範圍內', () => {
    for (const c of map.counties) {
      expect(c.d, c.name).toMatch(/^M[\d.,L]+Z/);
      const [x, y] = c.label as [number, number];
      expect(x, c.name).toBeGreaterThan(0);
      expect(x, c.name).toBeLessThan(width);
      expect(y, c.name).toBeGreaterThan(0);
      expect(y, c.name).toBeLessThan(height);
    }
  });

  it('資料庫的縣市（migrations）在地圖上都找得到（用名稱對應）', () => {
    expect(migrationNames.length).toBeGreaterThanOrEqual(17);
    const names = new Set(map.counties.map((c) => c.name));
    expect(migrationNames.filter((n) => !names.has(n))).toEqual([]);
  });

  it('金門、連江放在小框裡', () => {
    expect(map.insets.map((i) => i.name).sort()).toEqual(['連江縣', '金門縣'].sort());
  });
});

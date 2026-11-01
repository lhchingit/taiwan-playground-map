import { describe, expect, it } from 'vitest';
import { shouldSkip } from '../../scripts/vercel-ignore.mjs';

const prod = { VERCEL_ENV: 'production' };

describe('shouldSkip（Vercel 要不要跳過部署）', () => {
  it('不是正式環境就跳過', () => {
    expect(shouldSkip({ VERCEL_ENV: 'preview' }, ['src/app/page.tsx'])).toBe(true);
    expect(shouldSkip({}, null)).toBe(true);
  });

  it('只改資料就跳過', () => {
    expect(shouldSkip(prod, ['data/raw/kee/research.json', 'data/seed/kee/places.json'])).toBe(
      true,
    );
  });

  it('資料加上腳本、測試、文件也跳過', () => {
    const files = [
      'data/seed/kee/places.json',
      'scripts/fetch_osm_parks.py',
      'scripts/tests/test_research.py',
      'tests/unit/x.test.ts',
      'docs/decisions.md',
      '.github/workflows/ci.yml',
      'AGENTS.md',
    ];
    expect(shouldSkip(prod, files)).toBe(true);
  });

  it('有網站會用到的檔案就建置', () => {
    for (const f of [
      'src/app/page.tsx',
      'public/icon.png',
      'supabase/migrations/0040_x.sql',
      'package.json',
      'vercel.json',
      'docs-old/a.md',
      'src/README.md',
    ]) {
      expect(shouldSkip(prod, ['data/seed/kee/places.json', f]), f).toBe(false);
    }
  });

  it('沒有改動或拿不到清單就建置', () => {
    expect(shouldSkip(prod, [])).toBe(false);
    expect(shouldSkip(prod, null)).toBe(false);
  });
});

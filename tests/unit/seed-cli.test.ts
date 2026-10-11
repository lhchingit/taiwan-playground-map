import { describe, expect, it } from 'vitest';
import type { SeedFile } from '@/types/place';
import { isAuthorized, revalidationTags } from '@/lib/revalidate';
import fixture from '../fixtures/seed-test.json';
import {
  isLocalDatabase,
  LOCAL_DB,
  parseCityArgs,
  parseSeedArgs,
  resolveDatabaseUrl,
} from '../../scripts/seed/cli';
import { crossCheck } from '../../scripts/seed/files';
import { boundsWithoutSeeds } from '../../scripts/seed/osm-bounds';
import { parseEnvFile, siteConfig } from '../../scripts/seed/revalidate-site';

describe('parseSeedArgs', () => {
  it('預設：全部縣市、真的寫入、只連本機', () => {
    expect(parseSeedArgs([])).toEqual({
      city: null,
      dryRun: false,
      prune: false,
      allowRemote: false,
    });
  });
  it('--city、--dry-run、--allow-remote', () => {
    expect(parseSeedArgs(['--city', 'hsq', '--dry-run', '--prune', '--allow-remote'])).toEqual({
      city: 'hsq',
      dryRun: true,
      prune: true,
      allowRemote: true,
    });
  });
  it('縣市代碼不對或不認得的參數 → 丟錯', () => {
    expect(() => parseSeedArgs(['--city'])).toThrow();
    expect(() => parseSeedArgs(['--city', '新竹縣'])).toThrow();
    expect(() => parseSeedArgs(['--force'])).toThrow('不認得的參數');
  });
});

describe('parseCityArgs', () => {
  it('status 可以不指定縣市', () => {
    expect(parseCityArgs(['status'])).toEqual({ action: 'status', code: null, allowRemote: false });
  });
  it('launch／unlaunch 一定要指定縣市', () => {
    expect(parseCityArgs(['launch', 'hsq', '--allow-remote'])).toEqual({
      action: 'launch',
      code: 'hsq',
      allowRemote: true,
    });
    expect(() => parseCityArgs(['launch'])).toThrow('要指定縣市代碼');
    expect(() => parseCityArgs(['unlaunch', 'HSQ'])).toThrow();
  });
  it('不認得的動作 → 顯示用法', () => {
    expect(() => parseCityArgs(['delete', 'hsq'])).toThrow('用法');
  });
});

describe('resolveDatabaseUrl', () => {
  it('沒設定 DATABASE_URL 時用本機', () => {
    expect(resolveDatabaseUrl(undefined, false)).toBe(LOCAL_DB);
  });
  it('不是本機時一定要 --allow-remote', () => {
    const remote = 'postgresql://u:p@db.example.supabase.co:5432/postgres';
    expect(() => resolveDatabaseUrl(remote, false)).toThrow('--allow-remote');
    expect(resolveDatabaseUrl(remote, true)).toBe(remote);
  });
});

describe('crossCheck（跨縣市檔案一致性）', () => {
  const mlc = fixture as SeedFile; // 測試資料的場地都在 mlc
  const clone = (f: (s: SeedFile) => void) => {
    const s = structuredClone(mlc);
    f(s);
    return s;
  };

  it('一致時沒有錯誤', () => {
    expect(crossCheck([['mlc', mlc]])).toEqual([]);
  });
  it('場地的 city 跟資料夾不符', () => {
    expect(crossCheck([['tyc', mlc]]).join()).toContain('跟資料夾不符');
  });
  it('屬性字典不同', () => {
    const other = clone((s) => {
      s.places = [];
      s.labels.amenity.extra = '多的';
    });
    expect(
      crossCheck([
        ['mlc', mlc],
        ['tyc', other],
      ]).join(),
    ).toContain('屬性字典');
  });
  it('同一個來源 id 內容不同', () => {
    const other = clone((s) => {
      s.places = [];
      s.sources.est = { label: '別的', url: null, kind: 'estimate' };
    });
    expect(
      crossCheck([
        ['mlc', mlc],
        ['tyc', other],
      ]).join(),
    ).toContain('來源 est');
  });
});

describe('boundsWithoutSeeds', () => {
  it('有種子資料的縣市不用 OSM 範圍', () => {
    const osm = { hsc: [1, 1, 2, 2], hsq: [3, 3, 4, 4] } as Record<
      string,
      [number, number, number, number]
    >;
    expect(Object.keys(boundsWithoutSeeds(osm, ['hsc']))).toEqual(['hsq']);
  });
});

describe('清快取 API', () => {
  it('密鑰正確才通過；沒設定密鑰一律不通過', () => {
    expect(isAuthorized('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorized('Bearer wrong!', 's3cret')).toBe(false);
    expect(isAuthorized('s3cret', 's3cret')).toBe(false);
    expect(isAuthorized(null, 's3cret')).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
    expect(isAuthorized('Bearer x', undefined)).toBe(false);
  });
  it('依縣市決定要清的 tag；代碼不對時拒絕', () => {
    expect(revalidationTags('hsq')).toEqual(['cities', 'places', 'places:hsq', 'city:hsq']);
    expect(revalidationTags(undefined)).toContain('attribute_defs');
    expect(revalidationTags('../x')).toBeNull();
    expect(revalidationTags(42)).toBeNull();
  });
});

describe('清快取要通知哪個網站', () => {
  const local = parseEnvFile(
    '# 註解\nSUPABASE_URL=http://127.0.0.1:54321\nSITE_URL=http://localhost:3000/\nREVALIDATE_SECRET=abc\n',
  );

  it('parseEnvFile 讀出 KEY=VALUE、忽略註解', () => {
    expect(local).toEqual({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SITE_URL: 'http://localhost:3000/',
      REVALIDATE_SECRET: 'abc',
    });
  });

  it('本機資料庫：環境變數沒設定時用 .env.local（去掉結尾的 /）', () => {
    expect(siteConfig({}, true, local)).toEqual({ site: 'http://localhost:3000', secret: 'abc' });
  });

  it('正式資料庫：不讀 .env.local，避免把正式環境的變更通知到本機網站', () => {
    expect(siteConfig({}, false, local)).toBeNull();
  });

  it('環境變數優先', () => {
    expect(
      siteConfig({ SITE_URL: 'https://example.tw', REVALIDATE_SECRET: 'prod' }, true, local),
    ).toEqual({ site: 'https://example.tw', secret: 'prod' });
  });

  it('isLocalDatabase', () => {
    expect(isLocalDatabase(LOCAL_DB)).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@db.example.supabase.co:5432/postgres')).toBe(false);
  });
});

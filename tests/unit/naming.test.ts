// 會員命名的規則（src/lib/naming.ts）：跟資料庫 check_naming()、naming_key() 一致，也跟本機命名工具共用依據清單
import { describe, expect, it } from 'vitest';
import { checkNamingVote, namingErrorMessage, namingKey, NAMING_BASES } from '@/lib/naming';
import { mergeNamingResults } from '../../scripts/seed/naming';
import { BASES, EXCLUDE_REASONS } from '../../scripts/tools/name/names-file';

describe('namingKey：全形半形、空白、大小寫視為相同', () => {
  it.each([
    ['東大 公園', '東大公園'],
    ['東大　公園', '東大公園'], // 全形空白
    ['ＡＢＣ公園', 'abc公園'], // 全形英文
    ['  Abc 公園 ', 'abc公園'],
  ])('%s → %s', (name, key) => {
    expect(namingKey(name)).toBe(key);
  });
});

describe('checkNamingVote', () => {
  it('命名：名稱必填、最多 40 字、不能是網址；依據只能是三種（不可以用 Google）', () => {
    expect(checkNamingVote('name', '某公園', '實地確認')).toBeNull();
    expect(checkNamingVote('name', '  ', '實地確認')).toContain('請填名稱');
    expect(checkNamingVote('name', '公'.repeat(41), '實地確認')).toContain('40');
    expect(checkNamingVote('name', 'https://x.tw', '實地確認')).toContain('網址');
    expect(checkNamingVote('name', '某公園', 'Google 地圖')).toContain('Google');
    expect(checkNamingVote('name', '某公園', '')).toContain('依據');
  });

  it('排除：理由只能是網站上的三種（「與官方場地是同一處」只在本機工具）', () => {
    expect(checkNamingVote('exclude', '', '私人社區')).toBeNull();
    expect(checkNamingVote('exclude', '', '與官方場地是同一處')).toContain('理由');
    expect(checkNamingVote('other', '', '私人社區')).not.toBeNull();
  });

  it('本機命名工具用同一份依據清單；排除理由多一項', () => {
    expect(BASES).toEqual(NAMING_BASES);
    expect(EXCLUDE_REASONS.at(-1)).toBe('與官方場地是同一處');
  });
});

describe('namingErrorMessage', () => {
  it('資料庫的錯誤 → 使用者看得懂的訊息', () => {
    expect(namingErrorMessage('今天的命名次數已達上限，明天再試')).toContain('上限');
    expect(namingErrorMessage('這一處已經處理過了')).toContain('重新整理');
    expect(namingErrorMessage('名稱不能是網址')).toBe('名稱不能是網址');
    expect(namingErrorMessage('permission denied')).toBe('送出失敗，請稍後再試。');
  });
});

describe('mergeNamingResults（pnpm naming:export）', () => {
  const on = '2026-10-14';
  it('新的結果加在後面；已經有的鍵不動；確認者不寫暱稱', () => {
    const existing = [{ key: 'w1', name: '人工命名', basis: '實地確認', by: 'admin', date: on }];
    const { entries, added } = mergeNamingResults(existing, [
      {
        osm_ref: 'w1',
        status: 'named',
        resolved_name: '會員命名',
        resolved_basis: '實地確認',
        resolved_by: 'votes',
        resolved_votes: 10,
        resolved_on: on,
      },
      {
        osm_ref: 'w2',
        status: 'named',
        resolved_name: '東大公園',
        resolved_basis: 'OSM 地圖上可見的名稱',
        resolved_by: 'votes',
        resolved_votes: 10,
        resolved_on: on,
      },
      {
        // 0029 之前通過的（當時門檻是 3，沒有記人數）
        osm_ref: 'w4',
        status: 'named',
        resolved_name: '西大公園',
        resolved_basis: '實地確認',
        resolved_by: 'votes',
        resolved_votes: null,
        resolved_on: on,
      },
      {
        osm_ref: 'n3',
        status: 'excluded',
        resolved_name: null,
        resolved_basis: '私人社區',
        resolved_by: 'moderator',
        resolved_votes: null,
        resolved_on: on,
      },
    ]);
    expect(entries[0]).toEqual(existing[0]);
    expect(added).toEqual([
      {
        key: 'w2',
        name: '東大公園',
        basis: 'OSM 地圖上可見的名稱',
        by: '會員 10 人一致',
        date: on,
      },
      { key: 'w4', name: '西大公園', basis: '實地確認', by: '會員 3 人一致', date: on },
      { key: 'n3', name: '（排除）', basis: '私人社區', by: '審核員', date: on },
    ]);
  });
});

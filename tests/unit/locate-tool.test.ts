// 人工定位工具：manual-review.tsv 的格式（跟 scripts/lib/manual.py 一致）與清單來源
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadItems } from '../../scripts/tools/locate/items';
import {
  parseReviewFile,
  serializeReviewFile,
  upsertEntry,
  validateEntry,
  type ReviewEntry,
} from '../../scripts/tools/locate/review-file';

const SAMPLE = readFileSync('tests/fixtures/manual-review-sample.tsv', 'utf8');

const entry = (e: Partial<ReviewEntry>): ReviewEntry => ({
  no: '9',
  status: 'located',
  lat: 24.83,
  lng: 120.97,
  basis: '實地確認',
  ref: '',
  note: '',
  by: '測試者',
  date: '2026-10-11',
  ...e,
});

/** CSV（csv 模組輸出、可能有引號）只取第一欄 */
function csvFirstColumn(path: string): string[] {
  return readFileSync(path, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.split(',')[0]!.replace(/"/g, ''));
}

describe('manual-review.tsv 格式', () => {
  it('讀進來再寫出去，跟共用的範例檔逐字相同（Python 也用這個檔測試）', () => {
    expect(serializeReviewFile(parseReviewFile(SAMPLE))).toBe(SAMPLE);
  });

  it('依清冊編號排序，非該狀態用不到的欄位清空，說明裡的換行與 tab 換成空白', () => {
    const out = serializeReviewFile([
      entry({ no: '32', status: 'duplicate', ref: '15', lat: 1, lng: 2, note: 'a\tb\nc' }),
      entry({ no: '9' }),
    ]);
    const lines = out.trimEnd().split('\n');
    expect(lines[1]!.startsWith('9\tlocated\t24.83\t120.97\t實地確認\t')).toBe(true);
    expect(lines[2]).toBe('32\tduplicate\t\t\t\t15\ta b c\t測試者\t2026-10-11');
  });

  it('欄位不對時丟錯', () => {
    expect(() => parseReviewFile('編號\t狀態\n')).toThrow('欄位不對');
  });

  it('upsert：同一個編號取代', () => {
    const list = upsertEntry([entry({ note: '舊' })], entry({ note: '新' }));
    expect(list.map((e) => e.note)).toEqual(['新']);
  });
});

describe('validateEntry（跟 lib/manual.py 相同的規則）', () => {
  it('合法', () => {
    expect(validateEntry(entry({}))).toEqual([]);
    expect(
      validateEntry(entry({ status: 'pending_visit', lat: null, lng: null, basis: '' })),
    ).toEqual([]);
  });
  it('已定位一定要有座標與允許的定位依據', () => {
    expect(validateEntry(entry({ lat: null })).join()).toContain('沒有座標');
    expect(validateEntry(entry({ basis: 'Google 地圖' })).join()).toContain('定位依據');
  });
  it('座標要在台灣（抓經緯度寫反）', () => {
    expect(validateEntry(entry({ lat: 120.97, lng: 24.83 })).join()).toContain('台灣');
  });
  it('重複要填對應編號，而且不能是自己', () => {
    expect(validateEntry(entry({ status: 'duplicate', ref: '' })).join()).toContain('對應');
    expect(validateEntry(entry({ status: 'duplicate', ref: '9' })).join()).toContain('自己');
  });
  it('一定要有定位者', () => {
    expect(validateEntry(entry({ by: ' ' })).join()).toContain('定位者');
  });
});

describe('工具的清單', () => {
  const items = loadItems('.');

  it('跟匯入流程產生的 review 清單相同（找不到座標 22 筆、待確認比對 10 筆）', () => {
    const nos = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.no);
    expect(nos('unmatched')).toEqual(csvFirstColumn('data/review/hsc/unmatched.csv'));
    expect(nos('match-review')).toEqual(csvFirstColumn('data/review/hsc/match-review.csv'));
    expect(items).toHaveLength(32);
  });

  it('附上公園資料的提示（吉羊公園）', () => {
    const jiyang = items.filter((i) => i.name === '吉羊公園');
    expect(jiyang.map((i) => i.no)).toEqual(['15', '32']);
    expect(jiyang[0]?.hint?.location).toBe('吉羊路、東大路');
  });
});

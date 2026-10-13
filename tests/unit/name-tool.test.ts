// 人工命名工具（scripts/tools/name）：清單、manual-names.tsv 的讀寫與檢查
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../scripts/tools/name/items';
import {
  EXCLUDE,
  parseNamesFile,
  serializeNamesFile,
  upsertName,
  validateName,
  type NameEntry,
} from '../../scripts/tools/name/names-file';

const SAMPLE = readFileSync('tests/fixtures/manual-names-sample.tsv', 'utf8');
const ok: NameEntry = {
  key: 'n1',
  name: '文化公園',
  basis: 'OSM 地圖上可見的名稱',
  by: '測試者',
  date: '2026-10-13',
};

describe('parseCsv', () => {
  it('有 BOM、欄位裡有逗號與引號', () => {
    const rows = parseCsv(
      '\uFEFFOSM,處理方式\r\nn1,"填名稱，或「（排除）」"\r\nn2,"有""引號"""\r\n',
    );
    expect(rows).toEqual([
      { OSM: 'n1', 處理方式: '填名稱，或「（排除）」' },
      { OSM: 'n2', 處理方式: '有"引號"' },
    ]);
  });
});

describe('manual-names.tsv', () => {
  it('讀寫跟共用樣本一致（Python 端也讀這個檔）', () => {
    const entries = parseNamesFile(SAMPLE);
    expect(entries.map((e) => [e.key, e.name])).toEqual([
      ['n100', '文化公園'],
      ['w200', EXCLUDE],
    ]);
    expect(serializeNamesFile(entries, 'OSM')).toBe(SAMPLE);
  });

  it('臺北市的鍵是編號', () => {
    expect(serializeNamesFile([{ ...ok, key: '110' }], '編號').split('\n')[0]).toBe(
      '編號\t名稱\t依據\t確認者\t日期',
    );
  });

  it('同一處再存一次會取代，不會重複', () => {
    const once = upsertName(parseNamesFile(SAMPLE), { ...ok, key: 'n100', name: '新名稱' });
    expect(once.map((e) => [e.key, e.name])).toEqual([
      ['n100', '新名稱'],
      ['w200', EXCLUDE],
    ]);
  });

  it('欄位裡的 Tab、換行不會弄壞格式', () => {
    const text = serializeNamesFile([{ ...ok, name: '文化\t公園\n' }], 'OSM');
    expect(parseNamesFile(text)[0]?.name).toBe('文化 公園');
  });
});

describe('validateName', () => {
  const allow = { allowExclude: true };
  it('正確的命名與排除', () => {
    expect(validateName(ok, allow)).toEqual([]);
    expect(validateName({ ...ok, name: EXCLUDE, basis: '私人社區' }, allow)).toEqual([]);
  });
  it('依據只能是三種（不可以用 Google）', () => {
    expect(validateName({ ...ok, basis: 'Google 地圖' }, allow).join()).toContain('命名依據要是');
    expect(validateName({ ...ok, basis: '' }, allow).join()).toContain('命名依據要是');
  });
  it('名稱不能是網址、不能太長、不能空白', () => {
    expect(validateName({ ...ok, name: 'https://maps.app.goo.gl/x' }, allow).join()).toContain(
      '網址',
    );
    expect(validateName({ ...ok, name: '公'.repeat(41) }, allow).join()).toContain('40 字');
    expect(validateName({ ...ok, name: '' }, allow).join()).toContain('沒有填名稱');
  });
  it('排除要有理由；臺北市不能排除', () => {
    expect(validateName({ ...ok, name: EXCLUDE, basis: '不想要' }, allow).join()).toContain('理由');
    expect(
      validateName({ ...ok, name: EXCLUDE, basis: '私人社區' }, { allowExclude: false }).join(),
    ).toContain('不能排除');
  });
  it('要填確認者', () => {
    expect(validateName({ ...ok, by: '' }, allow).join()).toContain('確認者');
  });
});

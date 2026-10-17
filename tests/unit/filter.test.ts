// filter-cases.json 沒涵蓋的規則。假資料在 tests/fixtures/filter-edge-places.json。
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterPlaces, type FilterPlace, type Filters } from '@/lib/filter';
import edge from '../fixtures/filter-edge-places.json';

const places = edge.places as FilterPlace[];

function run(f: Partial<Filters>) {
  const { results, unknownHint } = filterPlaces(places, { ...DEFAULT_FILTERS, ...f }, edge.origin);
  return { ids: results.map((p) => p.id), unknownHint };
}

/** 只看這幾處，排除其他場地的干擾 */
const only = (ids: string[], ...keep: string[]) => ids.filter((id) => keep.includes(id));

describe('屬性三態', () => {
  it('n 永遠不通過，即使包含未知', () => {
    expect(only(run({ amen: ['toilet'], includeUnknown: true }).ids, 'test-known')).toEqual([]);
  });

  it('u 預設不通過，包含未知才通過', () => {
    expect(only(run({ play: ['sandpit'] }).ids, 'test-known')).toEqual([]);
    expect(only(run({ play: ['sandpit'], includeUnknown: true }).ids, 'test-known')).toEqual([
      'test-known',
    ]);
  });

  it('attrs 沒有的 key 當成未知', () => {
    expect(only(run({ play: ['slide'] }).ids, 'test-nulls')).toEqual([]);
    expect(only(run({ play: ['slide'], includeUnknown: true }).ids, 'test-nulls')).toEqual([
      'test-nulls',
    ]);
  });
});

describe('null 欄位當成未知', () => {
  const cases: [string, Partial<Filters>][] = [
    ['停留時長', { stay: ['30_60'] }],
    ['只看免費', { free: true }],
    ['停車類型', { pkType: ['lot'] }],
    ['停車費用', { pkFee: 'paid' }],
    ['停車格數', { pkMin: 10 }],
  ];
  it.each(cases)('%s：預設不通過、包含未知才通過，並算進 unknownHint', (_, f) => {
    const off = run(f);
    expect(off.ids).not.toContain('test-nulls');
    expect(off.unknownHint).toBeGreaterThanOrEqual(1);
    expect(run({ ...f, includeUnknown: true }).ids).toContain('test-nulls');
  });
});

describe('年齡不是篩選條件（decisions D25）', () => {
  it('年齡未知的場地不會因為年齡被濾掉', () => {
    expect(run({}).ids).toContain('test-nulls');
  });
});

describe('停車', () => {
  it('確定沒有停車位：選了費用或格數一律不通過，包含未知也一樣', () => {
    expect(run({ pkFee: 'free', includeUnknown: true }).ids).not.toContain('test-no-parking');
    expect(run({ pkMin: 1, includeUnknown: true }).ids).not.toContain('test-no-parking');
  });

  it('停車類型是 OR', () => {
    const { ids } = run({ pkType: ['lot', 'street'] });
    expect(ids).toEqual(['test-known', 'test-tie-a', 'test-tie-b']);
  });

  it('格數下限包含等於', () => {
    expect(only(run({ pkMin: 20 }).ids, 'test-known')).toEqual(['test-known']);
    expect(only(run({ pkMin: 21 }).ids, 'test-known')).toEqual([]);
  });
});

describe('其他條件', () => {
  it('室內／戶外', () => {
    expect(run({ env: 'in' }).ids).toEqual(['test-no-parking']);
    expect(run({ env: 'out' }).ids).not.toContain('test-no-parking');
  });

  it('只看免費：付費的不通過', () => {
    expect(run({ free: true, includeUnknown: true }).ids).not.toContain('test-no-parking');
  });

  it('距離上限', () => {
    // 1.1、2.2、3.3 公里
    expect(run({ maxKm: 3 }).ids).toEqual(['test-known', 'test-nulls']);
  });
});

describe('排序與提示', () => {
  it('依距離排序，距離相同時依 id', () => {
    expect(run({}).ids).toEqual([
      'test-known',
      'test-nulls',
      'test-no-parking',
      'test-tie-a',
      'test-tie-b',
    ]);
  });

  it('結果附上距離（公里）', () => {
    const { results } = filterPlaces(places, DEFAULT_FILTERS, edge.origin);
    expect(results[0]?.km).toBeCloseTo(1.112, 2);
  });

  it('已經包含未知時 unknownHint 為 0', () => {
    expect(run({ play: ['sandpit'], includeUnknown: true }).unknownHint).toBe(0);
  });

  it('沒有條件時 unknownHint 為 0', () => {
    expect(run({}).unknownHint).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filtersToQuery, queryToFilters, type Filters } from '@/lib/filter';

const known = { play: ['slide', 'sandpit', 'swing'], amen: ['toilet', 'shade'] };

describe('filtersToQuery', () => {
  it('預設條件 → 空字串', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('');
  });

  it('只輸出非預設值，順序固定、陣列排序、逗號不編碼', () => {
    const f: Filters = {
      ...DEFAULT_FILTERS,
      play: ['slide', 'sandpit'],
      amen: ['toilet'],
      maxKm: 5,
      includeUnknown: true,
    };
    expect(filtersToQuery(f)).toBe('play=sandpit,slide&amen=toilet&km=5&unk=1');
  });

  it('全部條件', () => {
    const f: Filters = {
      maxKm: 20,
      play: ['swing'],
      amen: ['shade', 'toilet'],
      stay: ['60_120', 'lt30'],
      env: 'out',
      free: true,
      includeUnknown: false,
      pkType: ['street', 'lot'],
      pkFee: 'paid',
      pkMin: 30,
    };
    expect(filtersToQuery(f)).toBe(
      'play=swing&amen=shade,toilet&km=20&stay=60_120,lt30&env=out&free=1&pk=lot,street&pkfee=paid&pkmin=30',
    );
  });

  it('重複值只輸出一次', () => {
    expect(filtersToQuery({ ...DEFAULT_FILTERS, play: ['slide', 'slide'] })).toBe('play=slide');
  });
});

describe('queryToFilters', () => {
  it('任務範例的網址（舊連結的 age 參數忽略，decisions D25）', () => {
    expect(queryToFilters('?play=sandpit,slide&amen=toilet&age=3&km=5&unk=1', known)).toEqual({
      ...DEFAULT_FILTERS,
      play: ['sandpit', 'slide'],
      amen: ['toilet'],
      maxKm: 5,
      includeUnknown: true,
    });
  });

  it('空字串 → 預設條件', () => {
    expect(queryToFilters('', known)).toEqual(DEFAULT_FILTERS);
  });

  it('往返轉換結果相同', () => {
    const f: Filters = {
      maxKm: 7,
      play: ['sandpit', 'swing'],
      amen: ['shade'],
      stay: ['half'],
      env: 'in',
      free: true,
      includeUnknown: true,
      pkType: ['lot'],
      pkFee: 'free',
      pkMin: 10,
    };
    expect(queryToFilters(filtersToQuery(f), known)).toEqual(f);
  });

  it('接受 URLSearchParams，%2C 編碼的逗號也能解析', () => {
    expect(queryToFilters(new URLSearchParams('play=sandpit%2Cslide'), known).play).toEqual([
      'sandpit',
      'slide',
    ]);
  });

  it('不合法的值丟棄，不丟錯', () => {
    const f = queryToFilters(
      'play=slide,jetpack,toilet&amen=slide&age=9&km=21&stay=forever&size=XL&env=space&free=yes&unk=true&pk=none,u&pkfee=u&pkmin=-5',
      known,
    );
    expect(f).toEqual({ ...DEFAULT_FILTERS, play: ['slide'] });
  });

  it('距離只接受 1–20 的整數', () => {
    expect(queryToFilters('km=0', known).maxKm).toBeNull();
    expect(queryToFilters('km=1', known).maxKm).toBe(1);
    expect(queryToFilters('km=2.5', known).maxKm).toBeNull();
    expect(queryToFilters('km=20', known).maxKm).toBe(20);
  });

  it('舊連結的 age、size 參數忽略，輸出的網址也不會有', () => {
    const f = queryToFilters('age=8&size=S&play=slide', known);
    expect(f).toEqual({ ...DEFAULT_FILTERS, play: ['slide'] });
    expect(filtersToQuery(f)).toBe('play=slide');
  });

  it('重複值去掉並排序', () => {
    expect(queryToFilters('play=slide,sandpit,slide', known).play).toEqual(['sandpit', 'slide']);
  });

  it('沒有出發點相關的參數', () => {
    const f = queryToFilters('lat=24.8&lng=120.9&origin=home', known);
    expect(f).toEqual(DEFAULT_FILTERS);
    expect(Object.keys(f)).not.toContain('origin');
  });
});

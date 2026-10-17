import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '@/lib/filter';
import {
  activeFilterCount,
  ageText,
  cardTags,
  groupTagKeys,
  distanceText,
  formatKm,
  parkingFilterOn,
  parkingText,
  parkingTri,
  stayText,
} from '@/lib/format';

describe('formatKm', () => {
  it('1 公里內用公尺', () => {
    expect(formatKm(0.4567)).toBe('457 公尺');
  });
  it('1 公里以上到小數一位', () => {
    expect(formatKm(1)).toBe('1.0 公里');
    expect(formatKm(12.345)).toBe('12.3 公里');
  });
});

describe('distanceText', () => {
  it('附上估算時間', () => {
    expect(distanceText(10, 'drive')).toBe('10.0 公里．約 27 分');
  });
  it('大眾運輸只顯示距離', () => {
    expect(distanceText(10, 'transit')).toBe('10.0 公里');
  });
});

describe('ageText／stayText', () => {
  it('年齡任一邊未知就顯示「年齡未知」', () => {
    expect(ageText({ age_min: 2, age_max: 10 })).toBe('2–10 歲');
    expect(ageText({ age_min: null, age_max: null })).toBe('年齡未知');
    expect(ageText({ age_min: 2, age_max: null })).toBe('年齡未知');
  });
  it('停留時長', () => {
    expect(stayText('30_60')).toBe('30 分–1 小時');
    expect(stayText(null)).toBe('時間未知');
  });
});

describe('停車', () => {
  it('parkingText 只列出已知的部分', () => {
    expect(parkingText({ type: 'lot', fee: 'paid', spaces: 40 })).toBe('停車場．付費．約 40 格');
    expect(parkingText({ type: 'street', fee: 'u', spaces: null })).toBe('路邊停車格');
    expect(parkingText({ type: 'u', fee: 'u', spaces: null })).toBe('類型未知');
    expect(parkingText({ type: 'none', fee: 'u', spaces: null })).toBe('無停車位');
  });
  it('parkingTri', () => {
    expect([parkingTri('lot'), parkingTri('none'), parkingTri('u')]).toEqual(['y', 'n', 'u']);
  });
  it('parkingFilterOn', () => {
    expect(parkingFilterOn(DEFAULT_FILTERS)).toBe(false);
    expect(parkingFilterOn({ ...DEFAULT_FILTERS, pkMin: 10 })).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('預設為 0；包含資料未知不算條件', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, includeUnknown: true })).toBe(0);
  });
  it('每個選項各算一項', () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        play: ['slide', 'swing'],
        groups: ['climb'],
        amen: ['toilet'],
        maxKm: 5,
        free: true,
        pkFee: 'paid',
      }),
    ).toBe(7);
  });
});

describe('cardTags', () => {
  const order = ['slide', 'swing', 'sandpit', 'a', 'b', 'c', 'd', 'toilet'];
  const attrs = { slide: 'y', toilet: 'y', a: 'y', b: 'y', c: 'y', d: 'y', swing: 'n' } as const;

  it('沒選條件時依 attribute_defs 順序取前 6 項「有」', () => {
    expect(cardTags(attrs, [], order).map((t) => t.key)).toEqual([
      'slide',
      'a',
      'b',
      'c',
      'd',
      'toilet',
    ]);
  });

  it('有選條件時顯示選的項目與狀態（沒有的 key 為未知）', () => {
    expect(cardTags(attrs, ['swing', 'sandpit', 'toilet'], order)).toEqual([
      { key: 'swing', v: 'n' },
      { key: 'sandpit', v: 'u' },
      { key: 'toilet', v: 'y' },
    ]);
  });
});

describe('groupTagKeys（decisions D26）', () => {
  const groupKeys = { climb: ['climbing', 'climbing_wall', 'rope_net'], ride: ['slide'] };

  it('列出這一類「有」的項目', () => {
    expect(
      groupTagKeys({ climbing: 'y', climbing_wall: 'n', rope_net: 'y' }, ['climb'], groupKeys),
    ).toEqual(['climbing', 'rope_net']);
  });

  it('一項都沒有時列出未知的項目（沒有的 key 也是未知）', () => {
    expect(groupTagKeys({ climbing: 'n', climbing_wall: 'u' }, ['climb'], groupKeys)).toEqual([
      'climbing_wall',
      'rope_net',
    ]);
  });

  it('沒選類別或不認得的代號不列', () => {
    expect(groupTagKeys({ slide: 'y' }, [], groupKeys)).toEqual([]);
    expect(groupTagKeys({ slide: 'y' }, ['nope'], groupKeys)).toEqual([]);
  });
});

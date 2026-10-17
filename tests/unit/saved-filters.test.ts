import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type Filters } from '@/lib/filter';
import {
  checkSavedName,
  defaultSavedName,
  filterSummary,
  SAVED_NAME_MAX,
} from '@/lib/saved-filters';

const catalog = {
  labels: { sandpit: '沙坑', slide: '溜滑梯', climbing: '攀爬架', toilet: '廁所', shade: '遮蔭' },
  playGroups: [
    { name: '滑行擺盪', keys: ['slide'] },
    { name: '攀爬平衡', keys: ['climbing'] },
    { name: '玩沙玩水', keys: ['sandpit'] },
  ],
};
const f = (p: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...p });

describe('filterSummary（decisions D27）', () => {
  it('沒有條件是空字串', () => {
    expect(filterSummary(DEFAULT_FILTERS, catalog)).toBe('');
  });

  it('依篩選面板的順序：距離、遊樂設施（依類別）、生活機能、停車、停留、室內外、免費、含未知', () => {
    expect(
      filterSummary(
        f({
          maxKm: 5,
          play: ['sandpit', 'slide'],
          groups: ['climb'],
          amen: ['toilet'],
          pkType: ['lot'],
          pkFee: 'free',
          pkMin: 30,
          stay: ['60_120'],
          env: 'out',
          free: true,
          includeUnknown: true,
        }),
        catalog,
      ),
    ).toBe(
      '5 公里內＋溜滑梯＋攀爬平衡（任一種）＋沙坑＋廁所＋停車場＋停車免費＋至少 30 格＋停留 1–2 小時＋戶外＋免費＋含資料未知',
    );
  });

  it('不認得的 key 用 key 本身', () => {
    expect(filterSummary(f({ amen: ['nope'] }), catalog)).toBe('nope');
  });
});

describe('defaultSavedName', () => {
  it('短的照用', () => {
    expect(defaultSavedName(f({ play: ['sandpit'], amen: ['toilet'] }), catalog)).toBe(
      '沙坑＋廁所',
    );
  });

  it(`超過 ${SAVED_NAME_MAX} 字截斷加「…」`, () => {
    const name = defaultSavedName(
      f({ maxKm: 5, play: ['sandpit', 'slide'], amen: ['toilet', 'shade'], free: true, env: 'in' }),
      catalog,
    );
    expect([...name]).toHaveLength(SAVED_NAME_MAX);
    expect(name.endsWith('…')).toBe(true);
    expect(checkSavedName(name)).toBeNull();
  });

  it('沒有條件時用「我的篩選」', () => {
    expect(defaultSavedName(DEFAULT_FILTERS, catalog)).toBe('我的篩選');
  });
});

describe('checkSavedName', () => {
  it('空白不行、20 字可以、21 字不行（前後空白不算）', () => {
    expect(checkSavedName('  ')).not.toBeNull();
    expect(checkSavedName(` ${'一'.repeat(20)} `)).toBeNull();
    expect(checkSavedName('一'.repeat(21))).not.toBeNull();
  });
});

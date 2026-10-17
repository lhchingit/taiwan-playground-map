// 標準答案：tests/fixtures/filter-cases.json（由原型實際計算產生）。結果與順序都必須完全相同。
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterPlaces, type Filters } from '@/lib/filter';
import cases from '../fixtures/filter-cases.json';
import { loadSeedPlaces } from './helpers';

/** fixture 的條件用原型的 unk，其他名稱與 Filters 相同 */
type CaseFilters = Partial<Omit<Filters, 'includeUnknown'>> & { unk?: boolean };

function toFilters({ unk, ...rest }: CaseFilters): Filters {
  return { ...DEFAULT_FILTERS, ...rest, includeUnknown: unk ?? false };
}

const places = loadSeedPlaces();

describe('filter-cases.json', () => {
  it('有 18 個案例（年齡、規模篩選的 3 個已移除，decisions D25）', () => {
    expect(cases.cases).toHaveLength(18);
  });

  it.each(cases.cases)('$name', (c) => {
    const { results, unknownHint } = filterPlaces(
      places,
      toFilters(c.filters as CaseFilters),
      cases.origin,
    );
    expect(results.map((p) => p.id)).toEqual(c.expected_ids);
    expect(results).toHaveLength(c.expected_count);
    expect(unknownHint).toBe(c.unknown_hint);
  });
});

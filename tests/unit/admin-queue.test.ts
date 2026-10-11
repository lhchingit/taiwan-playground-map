import { describe, expect, it } from 'vitest';
import { groupQueue, itemKey } from '@/lib/admin/queue';
import { statusNotice } from '@/lib/place-detail';
import type { Json } from '@/types/database';

let n = 0;
const item = (placeId: string | null, kind: string, payload: Json, createdAt: string) => ({
  id: ++n,
  placeId,
  kind,
  payload,
  createdAt,
});

describe('待審清單分組', () => {
  it('同一個場地、同一個項目放在一組；最舊的在前', () => {
    const a = item('p1', 'attribute', { key: 'slide', value: 'y' }, '2026-10-02');
    const b = item('p1', 'attribute', { key: 'slide', value: 'y', note: '另一個人' }, '2026-10-01');
    const c = item('p1', 'attribute', { key: 'swing', value: 'y' }, '2026-10-03');
    const groups = groupQueue([a, b, c]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[b.id, a.id], [c.id]]);
    // 補充說明不同、建議的值相同：不算意見不一致
    expect(groups[0]!.conflict).toBe(false);
  });

  it('建議的值不同 → 意見不一致', () => {
    const groups = groupQueue([
      item('p1', 'attribute', { key: 'slide', value: 'y' }, '2026-10-01'),
      item('p1', 'attribute', { key: 'slide', value: 'n' }, '2026-10-02'),
      item('p1', 'field', { field: 'hours', value: '06:00–22:00' }, '2026-10-03'),
      item('p1', 'field', { field: 'hours', value: ' 06:00–22:00 ' }, '2026-10-04'),
      item('p1', 'closure', { reason: 'a', until: '2026-12-01' }, '2026-10-05'),
      item('p1', 'closure', { reason: 'b', until: '2027-01-01' }, '2026-10-06'),
    ]);
    expect(groups.map((g) => g.conflict)).toEqual([true, false, true]);
  });

  it('不同場地、不同欄位分開；新增場地每筆各自一組', () => {
    const groups = groupQueue([
      item('p1', 'field', { field: 'hours', value: 'x' }, '2026-10-01'),
      item('p1', 'field', { field: 'surface', value: 'x' }, '2026-10-01'),
      item('p2', 'field', { field: 'hours', value: 'x' }, '2026-10-01'),
      item(null, 'new_place', { name: 'A' }, '2026-10-01'),
      item(null, 'new_place', { name: 'A' }, '2026-10-01'),
    ]);
    expect(groups).toHaveLength(5);
  });

  it('項目的定義跟資料庫的唯一索引一致', () => {
    expect(itemKey('attribute', { key: 'slide' })).toBe('attribute:slide');
    expect(itemKey('field', { field: 'hours' })).toBe('field:hours');
    expect(itemKey('parking', { type: 'lot' })).toBe('parking');
    expect(itemKey('closure', {})).toBe('closure');
  });
});

describe('場地狀態的提醒', () => {
  const today = '2026-10-11';
  it('開放、季節性開放不顯示', () => {
    expect(statusNotice('open', null, today)).toBeNull();
    expect(statusNotice('seasonal', null, today)).toBeNull();
  });

  it('維修中、已封閉：原因與預計恢復日期', () => {
    expect(statusNotice('maintenance', { note: '遊具維修中', until: '2026-12-31' }, today)).toBe(
      '維修中：遊具維修中（預計 2026-12-31 恢復）',
    );
    expect(statusNotice('closed', { note: null, until: null }, today)).toBe('已封閉');
  });

  it('過了預計恢復日期，提醒可能已經恢復', () => {
    expect(statusNotice('maintenance', { note: null, until: '2026-10-01' }, today)).toBe(
      '維修中（預計 2026-10-01 恢復）。已過預計恢復日期，可能已經恢復，出發前請先確認',
    );
  });
});

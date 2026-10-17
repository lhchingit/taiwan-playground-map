import { describe, expect, it } from 'vitest';
import {
  adminLogText,
  attributeHistoryText,
  changedBy,
  fieldHistoryText,
  roleLabel,
} from '@/lib/admin/history';

const SOURCES: Record<string, string> = { hccg: '清冊', user: '使用者回報（已審核）' };
const source = (id: string | null | undefined) => (id ? (SOURCES[id] ?? id) : null);
const names = new Map([['u1', '小明爸爸']]);

describe('修改紀錄的文字', () => {
  it('屬性：有／無／未知、來源名稱、新增前是「沒有資料」', () => {
    expect(
      attributeHistoryText(
        {
          key: 'footwash',
          old_value: null,
          new_value: 'y',
          old_source: null,
          new_source: 'user',
          changed_by: 'u1',
        },
        { footwash: '洗腳池' },
        source,
        names,
      ),
    ).toEqual({
      item: '洗腳池',
      from: '沒有資料',
      to: '有（使用者回報（已審核））',
      by: '小明爸爸',
    });
    expect(
      attributeHistoryText(
        {
          key: 'slide',
          old_value: 'y ',
          new_value: null,
          old_source: 'hccg',
          new_source: null,
          changed_by: null,
        },
        {},
        source,
        names,
      ),
    ).toEqual({ item: 'slide', from: '有（清冊）', to: '沒有資料', by: '匯入' });
  });

  it('狀態：中文與預計恢復日期', () => {
    expect(
      fieldHistoryText(
        {
          field: 'status',
          old_value: 'open',
          new_value: 'closed',
          old_source: null,
          new_source: 'user',
          old_until: null,
          new_until: '2027-01-15',
          changed_by: 'gone',
        },
        source,
        names,
      ),
    ).toEqual({
      item: '狀態',
      from: '開放中',
      to: '已封閉（預計 2027-01-15 恢復）（使用者回報（已審核））',
      by: '已刪除的帳號',
    });
  });

  it('開放時間', () => {
    expect(
      fieldHistoryText(
        {
          field: 'hours',
          old_value: '24 小時',
          new_value: '06:00–22:00',
          old_source: null,
          new_source: 'user',
          old_until: null,
          new_until: null,
          changed_by: 'u1',
        },
        source,
        names,
      ).from,
    ).toBe('24 小時');
  });

  it('修改者：匯入、暱稱、已刪除的帳號', () => {
    expect(changedBy(null, names)).toBe('匯入');
    expect(changedBy('u1', names)).toBe('小明爸爸');
    expect(changedBy('x', names)).toBe('已刪除的帳號');
  });
});

describe('管理員操作紀錄的文字', () => {
  const city = (c: string) => ({ hsc: '新竹市', hsq: '新竹縣' })[c] ?? c;
  it('角色、負責縣市、停權', () => {
    expect(adminLogText('set_role', { role: 'member' }, { role: 'moderator' }, city)).toBe(
      '角色：會員 → 審核員',
    );
    expect(adminLogText('set_cities', { cities: [] }, { cities: ['hsc', 'hsq'] }, city)).toBe(
      '負責縣市：無 → 新竹市、新竹縣',
    );
    expect(adminLogText('ban', null, { reason: '灌水' }, city)).toBe('停權：灌水');
    expect(adminLogText('unban', { reason: '灌水' }, null, city)).toBe('解除停權');
    expect(
      adminLogText('set_naming_threshold', { naming_threshold: 3 }, { naming_threshold: 10 }, city),
    ).toBe('命名自動通過門檻：3 → 10 人');
    expect(roleLabel('admin')).toBe('管理員');
  });
});

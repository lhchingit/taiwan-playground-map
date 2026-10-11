import { describe, expect, it } from 'vitest';
import { parseSuggestion, submitErrorMessage } from '@/lib/suggestions/form';

const KEYS = ['footwash', 'slide', 'toilet'];
const parse = (f: Record<string, string>) => parseSuggestion(f, KEYS);

describe('設施或生活機能', () => {
  it('有／沒有＋補充說明', () => {
    expect(parse({ kind: 'attribute', key: 'footwash', value: 'y', note: '  東側入口 ' })).toEqual({
      ok: true,
      kind: 'attribute',
      payload: { key: 'footwash', value: 'y', note: '東側入口' },
    });
    expect(parse({ kind: 'attribute', key: 'slide', value: 'n' })).toEqual({
      ok: true,
      kind: 'attribute',
      payload: { key: 'slide', value: 'n' },
    });
  });

  it('項目不存在、值不是有或沒有、說明太長都不行', () => {
    expect(parse({ kind: 'attribute', key: 'nope', value: 'y' })).toMatchObject({ ok: false });
    expect(parse({ kind: 'attribute', key: 'slide', value: 'u' })).toMatchObject({
      ok: false,
      error: '請選擇「有」或「沒有」。',
    });
    expect(
      parse({ kind: 'attribute', key: 'slide', value: 'y', note: '字'.repeat(201) }),
    ).toMatchObject({
      ok: false,
      error: '補充說明最多 200 個字。',
    });
  });
});

describe('停車', () => {
  it('停車場：費用、格數、費用說明', () => {
    expect(
      parse({ kind: 'parking', type: 'lot', fee: 'paid', spaces: '40', fee_note: '每小時 30 元' }),
    ).toEqual({
      ok: true,
      kind: 'parking',
      payload: { type: 'lot', fee: 'paid', spaces: 40, fee_note: '每小時 30 元' },
    });
  });

  it('格數沒填是 null、費用沒選是不確定', () => {
    expect(parse({ kind: 'parking', type: 'street', spaces: '' })).toEqual({
      ok: true,
      kind: 'parking',
      payload: { type: 'street', fee: 'u', spaces: null },
    });
  });

  it('沒有停車位時忽略費用與格數', () => {
    expect(
      parse({ kind: 'parking', type: 'none', fee: 'paid', spaces: '3', fee_note: 'x' }),
    ).toEqual({
      ok: true,
      kind: 'parking',
      payload: { type: 'none', fee: 'u', spaces: null },
    });
  });

  it.each(['-1', '2.5', 'abc', '1e3'])('格數 %s 不行', (spaces) => {
    expect(parse({ kind: 'parking', type: 'lot', spaces })).toMatchObject({
      ok: false,
      error: '停車格數要填 0 以上的整數。',
    });
  });

  it('類型不能是未知或亂填', () => {
    expect(parse({ kind: 'parking', type: 'u' })).toMatchObject({ ok: false });
    expect(parse({ kind: 'parking', type: 'garage' })).toMatchObject({ ok: false });
  });
});

describe('基本資料', () => {
  it('開放時間、地面材質', () => {
    expect(parse({ kind: 'field', field: 'hours', field_value: '06:00–22:00' })).toEqual({
      ok: true,
      kind: 'field',
      payload: { field: 'hours', value: '06:00–22:00' },
    });
    expect(parse({ kind: 'field', field: 'surface', field_value: '人工草皮' })).toMatchObject({
      ok: true,
    });
  });

  it('其他欄位、空白內容不行', () => {
    expect(parse({ kind: 'field', field: 'name', field_value: '改名' })).toMatchObject({
      ok: false,
    });
    expect(parse({ kind: 'field', field: 'hours', field_value: '   ' })).toMatchObject({
      ok: false,
      error: '請填寫內容。',
    });
  });
});

describe('封閉或維修', () => {
  it('原因＋預計恢復日期', () => {
    expect(parse({ kind: 'closure', reason: '遊具維修中', until: '2026-12-31' })).toEqual({
      ok: true,
      kind: 'closure',
      payload: { reason: '遊具維修中', until: '2026-12-31' },
    });
    expect(parse({ kind: 'closure', reason: '整修', until: '' })).toEqual({
      ok: true,
      kind: 'closure',
      payload: { reason: '整修', until: null },
    });
  });

  it.each(['2026-02-30', '2026/12/31', '下個月'])('日期 %s 不行', (until) => {
    expect(parse({ kind: 'closure', reason: '整修', until })).toMatchObject({
      ok: false,
      error: '預計恢復日期的格式不對。',
    });
  });

  it('一定要有原因', () => {
    expect(parse({ kind: 'closure', reason: '' })).toMatchObject({ ok: false });
  });
});

it('不支援的類型（新增場地在首頁，不在這個表單）', () => {
  expect(parse({ kind: 'new_place' })).toMatchObject({ ok: false });
  expect(parse({})).toMatchObject({ ok: false });
});

describe('送出失敗的訊息', () => {
  it('重複、上限、權限、其他', () => {
    expect(submitErrorMessage({ code: '23505' })).toBe('你已經回報過，正在審核中。');
    expect(submitErrorMessage({ code: 'P0001', message: '今天的回報次數已達上限，明天再試' })).toBe(
      '今天的回報次數已達上限，明天再試。',
    );
    expect(submitErrorMessage({ code: '42501' })).toContain('停權');
    expect(submitErrorMessage({ code: 'XX000', message: 'boom' })).toBe(
      '修正建議沒有送出，請稍後再試。',
    );
  });
});

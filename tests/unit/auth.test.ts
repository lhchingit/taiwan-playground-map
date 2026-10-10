import { describe, expect, it } from 'vitest';
import { REJECT_REASON_LABEL, statusText, suggestionSummary } from '@/lib/auth/labels';
import { safeNext, withReport } from '@/lib/auth/next-path';

describe('safeNext：登入後只回到站內頁面', () => {
  it.each([
    ['/hsinchu-city', '/hsinchu-city'],
    [
      '/hsinchu-city/places/hsc-luguang-park?report=1',
      '/hsinchu-city/places/hsc-luguang-park?report=1',
    ],
    ['/me', '/me'],
    ['/%E6%96%B0', '/%E6%96%B0'],
  ])('接受 %s', (raw, out) => {
    expect(safeNext(raw)).toBe(out);
  });

  it.each([
    null,
    undefined,
    '',
    'hsinchu-city',
    '//evil.com',
    '//evil.com/path',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/\t/evil.com',
    '/\n/evil.com',
    '/' + 'a'.repeat(2001),
  ])('拒絕 %j', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });

  it('拒絕時用指定的預設值', () => {
    expect(safeNext('//evil.com', '/me')).toBe('/me');
  });
});

describe('withReport：登入後自動打開回報修正', () => {
  it('加上 report=1，保留原本的 query', () => {
    expect(withReport('/hsinchu-city?place=hsc-a&age=3')).toBe(
      '/hsinchu-city?place=hsc-a&age=3&report=1',
    );
    expect(withReport('/hsinchu-city/places/hsc-a')).toBe('/hsinchu-city/places/hsc-a?report=1');
  });
  it('不安全的路徑改成首頁', () => {
    expect(withReport('//evil.com')).toBe('/?report=1');
  });
});

describe('我的貢獻的用字', () => {
  it('狀態：未採納附上原因', () => {
    expect(statusText('pending', null)).toBe('審核中');
    expect(statusText('accepted', null)).toBe('已採納');
    expect(statusText('rejected', 'unverifiable')).toBe('未採納（無法查證）');
    expect(statusText('rejected', null)).toBe('未採納');
  });

  it('退回原因涵蓋資料庫允許的全部值', () => {
    expect(Object.keys(REJECT_REASON_LABEL).sort()).toEqual(
      ['duplicate', 'inappropriate', 'other', 'outdated', 'unverifiable'].sort(),
    );
  });

  it('建議內容的摘要', () => {
    const labels = { footwash: '洗腳池' };
    expect(suggestionSummary('attribute', { key: 'footwash', value: 'y' }, labels)).toBe(
      '洗腳池：有',
    );
    expect(suggestionSummary('attribute', { key: 'shade', value: 'n' })).toBe('shade：沒有');
    expect(suggestionSummary('parking', { type: 'lot', fee: 'paid', spaces: 40 })).toBe(
      '停車場，40 格',
    );
    expect(suggestionSummary('field', { field: 'hours', value: '06:00–22:00' })).toBe(
      '開放時間：06:00–22:00',
    );
    expect(suggestionSummary('closure', { reason: '遊具維修中', until: '2026-12-31' })).toBe(
      '遊具維修中，預計 2026-12-31 恢復',
    );
    expect(suggestionSummary('new_place', { name: '新公園', lat: 24.8, lng: 120.9 })).toBe(
      '新公園',
    );
    expect(suggestionSummary('attribute', null)).toBe('');
  });
});

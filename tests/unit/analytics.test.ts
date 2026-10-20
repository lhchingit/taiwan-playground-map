import { describe, expect, it } from 'vitest';
import { analyticsUrl } from '@/lib/analytics';

const SITE = 'https://taiwan-playground-map.vercel.app';

describe('analyticsUrl', () => {
  it('首頁與縣市頁保留篩選參數', () => {
    expect(analyticsUrl(`${SITE}/?play=sandpit,slide&km=5`)).toBe(
      `${SITE}/?play=sandpit,slide&km=5`,
    );
    expect(analyticsUrl(`${SITE}/hsinchu-city?amen=toilet`)).toBe(
      `${SITE}/hsinchu-city?amen=toilet`,
    );
  });

  it('管理後台、登入頁等拿掉參數', () => {
    expect(analyticsUrl(`${SITE}/admin/users?q=a@b.c`)).toBe(`${SITE}/admin/users`);
    expect(analyticsUrl(`${SITE}/admin?city=hsc`)).toBe(`${SITE}/admin`);
    expect(analyticsUrl(`${SITE}/login?next=%2Fme`)).toBe(`${SITE}/login`);
    expect(analyticsUrl(`${SITE}/me?delete_error=1`)).toBe(`${SITE}/me`);
  });

  it('場地頁拿掉參數', () => {
    expect(analyticsUrl(`${SITE}/hsinchu-city/places/hsc-001?report=1`)).toBe(
      `${SITE}/hsinchu-city/places/hsc-001`,
    );
  });

  it('不送 hash', () => {
    expect(analyticsUrl(`${SITE}/?km=3#x`)).toBe(`${SITE}/?km=3`);
  });
});

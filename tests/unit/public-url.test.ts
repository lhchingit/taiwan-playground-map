import { describe, expect, it } from 'vitest';
import { toPublicUrl } from '@/lib/auth/public-url';

const INTERNAL = 'http://host.docker.internal:54321';
const PUBLIC = 'http://127.0.0.1:54321';
const AUTHORIZE = '/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000';

describe('toPublicUrl：導給瀏覽器的 Supabase 網址', () => {
  it('換成瀏覽器用的網址', () => {
    expect(toPublicUrl(INTERNAL + AUTHORIZE, INTERNAL, PUBLIC)).toBe(PUBLIC + AUTHORIZE);
  });

  it('設定值結尾有斜線也可以', () => {
    expect(toPublicUrl(INTERNAL + AUTHORIZE, `${INTERNAL}/`, `${PUBLIC}/`)).toBe(
      PUBLIC + AUTHORIZE,
    );
  });

  it('沒設定時不變', () => {
    expect(toPublicUrl(INTERNAL + AUTHORIZE, INTERNAL, undefined)).toBe(INTERNAL + AUTHORIZE);
    expect(toPublicUrl(INTERNAL + AUTHORIZE, INTERNAL, '')).toBe(INTERNAL + AUTHORIZE);
  });

  it('不是 Supabase 的網址不換', () => {
    const google = 'https://accounts.google.com/o/oauth2/auth?x=1';
    expect(toPublicUrl(google, INTERNAL, PUBLIC)).toBe(google);
    // 只是開頭相同的其他主機也不換
    const other = 'http://host.docker.internal:543210/auth';
    expect(toPublicUrl(other, INTERNAL, PUBLIC)).toBe(other);
  });
});

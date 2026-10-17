// Google Identity Services 登入（decisions D28）的 nonce 與輸入檢查。
import { describe, expect, it } from 'vitest';
import { randomNonce, sha256Hex, validIdTokenInput } from '@/lib/auth/google';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

describe('randomNonce', () => {
  it('每次都是 64 個十六進位字元，而且不重複', () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('sha256Hex', () => {
  it('跟標準的 SHA-256 一樣（十六進位小寫）', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('validIdTokenInput', () => {
  const nonce = 'a'.repeat(64);
  it('JWT 三段＋64 字元 nonce 才通過', () => {
    expect(validIdTokenInput(TOKEN, nonce)).toBe(true);
  });
  it('token 格式不對、太長，或不是字串都擋下', () => {
    expect(validIdTokenInput('', nonce)).toBe(false);
    expect(validIdTokenInput('a.b', nonce)).toBe(false);
    expect(validIdTokenInput('a.b.c d', nonce)).toBe(false);
    expect(validIdTokenInput(`a.b.${'c'.repeat(8192)}`, nonce)).toBe(false);
    expect(validIdTokenInput(null, nonce)).toBe(false);
  });
  it('nonce 不是 64 個十六進位小寫字元就擋下', () => {
    expect(validIdTokenInput(TOKEN, '')).toBe(false);
    expect(validIdTokenInput(TOKEN, 'A'.repeat(64))).toBe(false);
    expect(validIdTokenInput(TOKEN, 'a'.repeat(63))).toBe(false);
    expect(validIdTokenInput(TOKEN, 123)).toBe(false);
  });
});

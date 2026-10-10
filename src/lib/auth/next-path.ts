// 登入後要回到的頁面（?next=）：只接受站內路徑，避免被當成開放式轉址（例如 ?next=//evil.com）。
const FALLBACK = '/';

export function safeNext(raw: string | null | undefined, fallback = FALLBACK): string {
  if (!raw || raw.length > 2000) return fallback;
  // 一定要以單一 / 開頭；// 與 /\ 會被瀏覽器當成別的網域
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  // 不接受控制字元（含換行、tab；瀏覽器會忽略它們，可能把 /<tab>/evil.com 變成 //evil.com）
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, 'http://n');
    if (u.origin !== 'http://n') return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** 在站內路徑加上 ?report=1（登入後自動打開「回報修正」） */
export function withReport(path: string): string {
  const u = new URL(safeNext(path), 'http://n');
  u.searchParams.set('report', '1');
  return u.pathname + u.search + u.hash;
}

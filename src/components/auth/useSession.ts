'use client';
// 目前登入的人（頁首、回報修正共用）。公開頁面是快取的靜態頁，登入狀態在瀏覽器向 /api/session 查詢。
// 同一頁只查一次（登入、登出都會換頁）；改暱稱後呼叫 refreshSession() 讓頁首重新查詢。
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface SessionInfo {
  user: { name: string; role: string; banned: boolean; termsAccepted: boolean } | null;
  /** googleClientId：有值時用 Google 官方登入按鈕（decisions D28） */
  providers: { google: boolean; email: boolean; googleClientId?: string | null };
  turnstileSiteKey: string | null;
}

let pending: Promise<SessionInfo> | null = null;

/** 查詢登入狀態（同一頁共用同一次查詢） */
export function loadSession(): Promise<SessionInfo> {
  pending ??= fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
    .then((r) =>
      r.ok ? (r.json() as Promise<SessionInfo>) : Promise.reject(new Error(String(r.status))),
    )
    .catch(() => {
      pending = null; // 下次再試
      return { user: null, providers: { google: false, email: true }, turnstileSiteKey: null };
    });
  return pending;
}

/** undefined：還在查詢 */
export function useSession(): SessionInfo | undefined {
  const [info, setInfo] = useState<SessionInfo>();
  useEffect(() => {
    let alive = true;
    const update = () =>
      void loadSession().then((s) => {
        if (alive) setInfo(s);
      });
    update();
    window.addEventListener(CHANGED, update);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED, update);
    };
  }, []);
  return info;
}

const CHANGED = 'playmap:session-changed';

/** 登入資料改了（例如暱稱）：重新查詢，所有用到 useSession 的元件跟著更新 */
export function refreshSession() {
  pending = null;
  window.dispatchEvent(new Event(CHANGED));
}

/** 目前頁面的路徑（登入後回到這裡） */
export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

const noSubscribe = () => () => {};

/** 目前頁面的路徑；伺服器端產生時是 '/'（靜態頁面不知道網址的 query） */
export function useCurrentPath(): string {
  return useSyncExternalStore(noSubscribe, currentPath, () => '/');
}

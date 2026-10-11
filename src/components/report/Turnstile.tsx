'use client';
// Cloudflare Turnstile 驗證元件。token 放在表單的隱藏欄位 cf-turnstile-response（Turnstile 自己加）。
// token 只能用一次：每次送出後父元件傳入新的 resetKey（例如新的送出結果），重新產生。
import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null;
    let alive = true;
    loadTurnstile()
      .then((api) => {
        if (alive && ref.current) {
          id = api.render(ref.current, { sitekey: siteKey, language: 'zh-tw', size: 'flexible' });
        }
      })
      .catch(() => {
        // 載入失敗時沒有 token，送出會得到「驗證沒有通過」
      });
    return () => {
      alive = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, resetKey]);
  return <div ref={ref} className="turnstile" />;
}

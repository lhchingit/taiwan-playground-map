'use client';
// Google 官方的登入按鈕（Google Identity Services，decisions D28）。Google 的畫面顯示網站網址，不是 Supabase 的網域。
// 每次顯示產生新的 nonce：雜湊交給 Google、原始值交給伺服器，token 不能被拿去重放。
import { useEffect, useRef, useState } from 'react';
import { signInWithGoogleIdToken } from '@/app/auth/actions';
import { randomNonce, sha256Hex } from '@/lib/auth/google';

interface GoogleIdApi {
  initialize: (opts: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleIdApi> | null = null;

function loadGoogle(): Promise<GoogleIdApi> {
  const ready = () => window.google?.accounts?.id;
  const api = ready();
  if (api) return Promise.resolve(api);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => {
      const loaded = ready();
      if (loaded) resolve(loaded);
      else reject(new Error('google'));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('google'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function GoogleButton({ clientId, next }: { clientId: string; next: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const nonce = randomNonce();
    void Promise.all([loadGoogle(), sha256Hex(nonce)])
      .then(([api, hashed]) => {
        const el = ref.current;
        if (!alive || !el) return;
        api.initialize({
          client_id: clientId,
          nonce: hashed,
          use_fedcm_for_button: true,
          callback: async ({ credential }: { credential?: string }) => {
            setMessage(null);
            setBusy(true);
            const r = await signInWithGoogleIdToken(credential ?? '', nonce).catch(() => ({
              ok: false as const,
              message: '連線失敗，請稍後再試。',
            }));
            if (r.ok) {
              // 整頁重新載入：頁首與「回報修正」重新查詢登入狀態
              window.location.assign(next);
              return;
            }
            setBusy(false);
            setMessage(r.message);
          },
        });
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        api.renderButton(el, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          locale: 'zh-TW',
          width: Math.min(400, Math.max(200, Math.round(el.clientWidth))),
        });
      })
      .catch(() => {
        if (alive) setMessage('Google 登入載入失敗，請檢查網路後重新整理。');
      });
    return () => {
      alive = false;
    };
  }, [clientId, next]);

  return (
    <div className="google-signin">
      <div ref={ref} className="google-signin-btn" aria-busy={busy} />
      {busy && (
        <p className="note" role="status">
          登入中…
        </p>
      )}
      {message && (
        <p className="note err" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

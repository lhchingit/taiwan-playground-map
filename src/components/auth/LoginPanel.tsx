'use client';
// 登入方式：Google、Email 登入連結（/login 頁與登入視窗共用）。不要求密碼。
import { useActionState } from 'react';
import { type MagicLinkState, sendMagicLink, signInWithGoogle } from '@/app/auth/actions';

const IDLE: MagicLinkState = { status: 'idle', message: '' };

export function LoginPanel({ next, google }: { next: string; google: boolean }) {
  const [state, action, pending] = useActionState(sendMagicLink, IDLE);
  return (
    <div className="login-panel">
      <p className="note">登入後可以回報修正、上傳照片。瀏覽地圖與場地資料不需要登入。</p>
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn login-btn" type="submit" disabled={!google}>
          用 Google 登入
        </button>
        {!google && <span className="note">（尚未設定）</span>}
      </form>
      <div className="login-or" aria-hidden="true">
        或
      </div>
      {state.status === 'sent' ? (
        <p className="note ok" role="status">
          {state.message}
        </p>
      ) : (
        <form action={action} className="me-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="login-email">用 Email 登入連結（不需要密碼）</label>
          <div className="me-row">
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="you@example.com"
            />
            <button className="btn primary" type="submit" disabled={pending}>
              寄登入連結
            </button>
          </div>
          <p className="note err" role="status">
            {state.status === 'error' ? state.message : ''}
          </p>
        </form>
      )}
      <p className="note small">其他人只看得到你的暱稱，不會看到 Email。</p>
    </div>
  );
}

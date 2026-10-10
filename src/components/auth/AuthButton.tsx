'use client';
// 頁首的登入按鈕：未登入顯示「登入」，登入後顯示暱稱與選單（我的貢獻、登出）。
// 只顯示暱稱，不顯示 Email 或登入方式。
import Link from 'next/link';
import { useCurrentPath, useSession } from './useSession';

export function AuthButton() {
  const session = useSession();
  const path = useCurrentPath();
  // /me 需要登入，從那裡登出要回首頁
  const here = path.startsWith('/me') ? '/' : path;

  if (!session) return <span className="auth-slot" aria-hidden="true" />;
  if (!session.user) {
    return (
      <Link
        className="btn auth-btn"
        href={`/login?next=${encodeURIComponent(here)}`}
        prefetch={false}
      >
        登入
      </Link>
    );
  }
  return (
    <details className="auth-menu">
      <summary className="btn auth-btn" aria-label={`已登入：${session.user.name}`}>
        {session.user.name}
      </summary>
      <div className="auth-pop">
        <Link href="/me" prefetch={false}>
          我的貢獻
        </Link>
        <form action="/auth/signout" method="post">
          <input type="hidden" name="next" value={here} />
          <button type="submit">登出</button>
        </form>
      </div>
    </details>
  );
}

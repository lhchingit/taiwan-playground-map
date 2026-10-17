'use client';
// 登入按鈕：未登入顯示「登入」，登入後顯示暱稱與選單（我的貢獻、登出）。放在視窗右上角（AuthCorner）。
// 只顯示暱稱，不顯示 Email 或登入方式。
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { currentPath, useCurrentPath, useSession } from './useSession';

/** 登入或登出後要回到的頁面：/me、/admin 需要登入，從那裡登出要回首頁 */
const backTo = (path: string) => (path.startsWith('/me') || path.startsWith('/admin') ? '/' : path);
const loginHref = (path: string) => `/login?next=${encodeURIComponent(backTo(path))}`;

export function AuthButton() {
  const session = useSession();
  const router = useRouter();
  const here = backTo(useCurrentPath());

  if (!session) return <span className="auth-slot" aria-hidden="true" />;
  if (!session.user) {
    return (
      <Link
        className="btn auth-btn"
        href={loginHref(here)}
        prefetch={false}
        // 篩選條件會改網址的 query：按下時才讀目前的網址，登入後回到同樣的篩選
        onClick={(e) => {
          e.preventDefault();
          router.push(loginHref(currentPath()));
        }}
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
        {['moderator', 'admin'].includes(session.user.role) && !session.user.banned && (
          <Link href="/admin" prefetch={false}>
            審核後台
          </Link>
        )}
        <form
          action="/auth/signout"
          method="post"
          onSubmit={(e) => {
            const next = e.currentTarget.elements.namedItem('next') as HTMLInputElement | null;
            if (next) next.value = backTo(currentPath());
          }}
        >
          <input type="hidden" name="next" value={here} />
          <button type="submit">登出</button>
        </form>
      </div>
    </details>
  );
}

// 登入頁（頁首「登入」按鈕）。登入後回到 ?next= 指定的站內頁面。
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoginPanel } from '@/components/auth/LoginPanel';
import { safeNext } from '@/lib/auth/next-path';
import { authProviders } from '@/lib/auth/providers';

export const metadata: Metadata = {
  title: '登入｜全台放電地圖',
  robots: { index: false },
};

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default function LoginPage({ searchParams }: Props) {
  return (
    <main className="place-page">
      <nav className="place-nav" aria-label="導覽">
        <Link href="/">← 全台放電地圖</Link>
      </nav>
      <article className="place-article">
        <div className="dhead">
          <h1>登入</h1>
        </div>
        <section className="dsec">
          <Suspense fallback={<p className="note">載入中…</p>}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </section>
      </article>
    </main>
  );
}

async function LoginContent({ searchParams }: Props) {
  const q = await searchParams;
  const next = safeNext(q.next);
  const { google } = await authProviders();
  return (
    <>
      {q.error && (
        <p className="note err" role="alert">
          登入沒有成功，請再試一次。如果是打開 Email 裡的連結，連結可能已經用過或超過 1 小時。
        </p>
      )}
      <LoginPanel next={next} google={google} />
    </>
  );
}

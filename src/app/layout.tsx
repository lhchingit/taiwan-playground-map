import type { Metadata, Viewport } from 'next';
import { Huninn } from 'next/font/google';
import { Suspense, type ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { AuthCorner } from '@/components/auth/AuthCorner';
import { SHORT_NAME, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';
import './globals.css';

// 標題字型在建置時下載、由本站提供，不在瀏覽器即時連 Google Fonts。
// 內文用系統的中文字型：自帶 Noto Sans TC 會產生 300 多個 @font-face（約 300 KB 會擋住畫面的 CSS）。
const huninn = Huninn({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-huninn',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // iOS「加入主畫面」的名稱；圖示是 src/app/apple-icon.png
  appleWebApp: { title: SHORT_NAME },
};

// 手機瀏覽器網址列的顏色：淺色用 --teal，深色用深色模式的 --paper
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1f7a52' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1a17' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={huninn.variable}>
      <body>
        {children}
        {/* 用到網址（usePathname），動態頁面要包在 Suspense 裡 */}
        <Suspense fallback={null}>
          <AuthCorner />
        </Suspense>
        <Analytics />
      </body>
    </html>
  );
}

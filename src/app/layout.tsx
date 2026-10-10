import type { Metadata } from 'next';
import { Huninn } from 'next/font/google';
import type { ReactNode } from 'react';
import { siteUrl } from '@/lib/site';
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
  title: '全台放電地圖',
  description: '台灣親子遊樂場與公園地圖：依遊樂設施、年齡、生活機能、停車與距離篩選。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={huninn.variable}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Huninn, Noto_Sans_TC } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// 字型在建置時下載、由本站提供，不在瀏覽器即時連 Google Fonts
const huninn = Huninn({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-huninn',
  preload: false,
});
const noto = Noto_Sans_TC({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-noto',
  preload: false,
});

export const metadata: Metadata = {
  title: '竹市放電地圖',
  description: '新竹市親子遊樂場與公園地圖：依遊樂設施、年齡、生活機能、停車與距離篩選。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW" className={`${huninn.variable} ${noto.variable}`}>
      <body>{children}</body>
    </html>
  );
}

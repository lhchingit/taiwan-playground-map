// PWA 的 web app manifest（decisions D1）：/manifest.webmanifest。讓家長把網站加到主畫面。
// 圖示由 pnpm icons 產生（scripts/build-icons.ts）；顏色沿用 globals.css 的 --paper、--teal。
// 還沒有 service worker，沒有離線功能。
import type { MetadataRoute } from 'next';
import { SHORT_NAME, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SHORT_NAME,
    description: SITE_DESCRIPTION,
    lang: 'zh-Hant-TW',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f7f2',
    theme_color: '#1c7a69',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

'use client';
// beforeSend 是函式，不能從伺服器元件傳下去，所以包一層用戶端元件（decisions D30）
import { Analytics } from '@vercel/analytics/next';
import { analyticsUrl } from '@/lib/analytics';

export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: analyticsUrl(event.url) })} />;
}

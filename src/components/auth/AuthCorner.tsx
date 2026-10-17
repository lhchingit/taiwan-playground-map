'use client';
// 登入按鈕固定在視窗右上角（像 Google 地圖）：在 root layout 只放一次，每一頁位置都一樣，捲動時也不動。
// 換頁時重新掛載（關閉打開的選單、更新登入後要回到的頁面）。登入頁本身就是登入畫面，不顯示。
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';

export function AuthCorner() {
  const pathname = usePathname();
  if (pathname.startsWith('/login')) return null;
  return (
    <nav className="auth-corner" aria-label="帳號">
      <AuthButton key={pathname} />
    </nav>
  );
}

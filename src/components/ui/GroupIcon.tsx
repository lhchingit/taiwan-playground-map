// 遊樂設施類別的小圖示（decisions D24）：自己畫的單色線條 SVG，顏色跟著文字（currentColor）。
// 只是裝飾（aria-hidden），類別名稱仍然是文字。
import type { Tone } from '@/lib/play-groups';

const PATHS: Record<Tone, string> = {
  // 溜滑梯：梯子＋滑道
  slide: 'M4 20V7M4 7h4M4 11h4M4 15h4M8 20V7l11 11h2',
  // 攀爬架：方格
  sky: 'M4 20V6h16v14M4 11h16M4 16h16M9 6v14M15 6v14',
  // 沙桶：桶身＋提把＋鏟子
  sun: 'M6 10h12l-1.5 10h-9zM8 10a4 4 0 0 1 8 0M19 4l-3 6',
  // 跳躍的人
  grass: 'M12 6.5a1.5 1.5 0 1 0 0-.01M12 9v5M8 10l4 1 4-1M9 21l3-7 3 7',
  // 星星（感官創意）
  grape: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.8z',
  // 水滴（生活機能：飲水、廁所）
  leaf: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
};

export function GroupIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  return (
    <svg
      className="gicon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[tone]} />
    </svg>
  );
}

// 首頁的遊樂場插圖（decisions D24）：太陽、雲、溜滑梯、鞦韆、草地。自己畫的 SVG，沒有外部圖片。
// 顏色用 globals.css 的 .pa-* class，深色模式跟著變。只是裝飾（aria-hidden）。
export function PlaygroundArt({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `pa ${className}` : 'pa'}
      viewBox="0 0 320 150"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 太陽 */}
      <g className="pa-sun">
        <circle cx="270" cy="34" r="16" />
        <path
          d="M270 8v6M270 54v6M244 34h6M290 34h6M252 16l4 4M284 48l4 4M288 16l-4 4M256 48l-4 4"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      {/* 雲 */}
      <path
        className="pa-cloud"
        d="M40 44a12 12 0 0 1 22-8 10 10 0 0 1 17 6 8 8 0 0 1-1 16H42a9 9 0 0 1-2-14z"
      />
      <path
        className="pa-cloud"
        d="M168 26a9 9 0 0 1 16-6 8 8 0 0 1 13 5 6 6 0 0 1-1 12h-26a7 7 0 0 1-2-11z"
      />
      {/* 草地 */}
      <path className="pa-grass" d="M0 136q80-24 160-10t160-8v20q0 12-12 12H12Q0 150 0 138z" />
      {/* 溜滑梯：梯子、平台、滑道 */}
      <g className="pa-frame" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M58 128V62M80 128V62M58 76h22M58 92h22M58 108h22" />
        <path d="M54 62h30" />
      </g>
      <path
        className="pa-slide"
        d="M80 62q10 0 22 18t30 38q8 8 22 8l-2 8q-18 0-28-10T106 86Q96 70 82 70z"
      />
      {/* 鞦韆 */}
      <g className="pa-frame" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M200 128l14-64M250 128l-14-64M210 64h30" />
      </g>
      <g className="pa-rope" strokeWidth="2" fill="none">
        <path d="M218 64v42M232 64v42" />
      </g>
      <rect className="pa-seat" x="213" y="104" width="24" height="6" rx="3" />
      {/* 小樹叢 */}
      <circle className="pa-bush" cx="292" cy="122" r="12" />
      <circle className="pa-bush" cx="304" cy="126" r="9" />
      <circle className="pa-bush" cx="22" cy="126" r="10" />
    </svg>
  );
}

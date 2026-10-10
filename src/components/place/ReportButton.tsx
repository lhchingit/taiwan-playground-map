'use client';

import { useState } from 'react';

/** 「回報修正」：P3 才開放，現在只顯示即將開放 */
export function ReportButton() {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button className="btn" type="button" onClick={() => setShown(true)} aria-expanded={shown}>
        回報修正
      </button>
      <p className="note report-soon" role="status">
        {shown ? '回報修正功能即將開放，謝謝你願意幫忙。' : ''}
      </p>
    </>
  );
}

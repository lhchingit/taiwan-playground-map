'use client';

import { useEffect, useRef, useState } from 'react';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { currentPath, useCurrentPath, useSession } from '@/components/auth/useSession';
import { withReport } from '@/lib/auth/next-path';

/**
 * 「回報修正」：要先登入。還沒登入時跳出登入視窗，登入後回到同一頁並自動打開回報區塊（?report=1）。
 * 提交修正在 P3(c) 開放，現在登入後顯示「即將開放」。
 */
export function ReportButton() {
  const session = useSession();
  const [clicked, setClicked] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const ref = useRef<HTMLParagraphElement>(null);
  // 登入後回到這一頁：網址有 ?report=1 就直接打開
  const path = useCurrentPath();
  const autoOpen = !!session?.user && new URL(path, 'http://n').searchParams.get('report') === '1';
  const shown = clicked || autoOpen;

  useEffect(() => {
    if (autoOpen) ref.current?.scrollIntoView({ block: 'center' });
  }, [autoOpen]);

  function open() {
    if (!session) return; // 還在確認登入狀態
    if (!session.user) setLogin(withReport(currentPath()));
    else setClicked(true);
  }

  return (
    <>
      <button className="btn" type="button" onClick={open} aria-expanded={shown}>
        回報修正
      </button>
      <p ref={ref} className="note report-soon" role="status">
        {shown ? '回報修正功能即將開放，謝謝你願意幫忙。' : ''}
      </p>
      <LoginDialog
        open={login !== null}
        onClose={() => setLogin(null)}
        next={login ?? '/'}
        google={session?.providers.google ?? false}
      />
    </>
  );
}

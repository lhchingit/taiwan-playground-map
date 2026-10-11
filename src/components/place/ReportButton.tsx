'use client';

import { useEffect, useRef, useState } from 'react';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { currentPath, loadSession, useCurrentPath, useSession } from '@/components/auth/useSession';
import { ReportForm, type ReportOption } from '@/components/report/ReportForm';
import { withReport } from '@/lib/auth/next-path';

/**
 * 「回報修正」：要先登入。還沒登入時跳出登入視窗，登入後回到同一頁並自動打開回報表單（?report=1）。
 * 被停權的帳號只顯示說明，不顯示表單（資料庫也會拒絕寫入）。
 */
export function ReportButton({
  placeId,
  options,
}: {
  placeId: string;
  options: readonly ReportOption[];
}) {
  const session = useSession();
  const [clicked, setClicked] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // 登入後回到這一頁：網址有 ?report=1 就直接打開
  const path = useCurrentPath();
  const autoOpen = !!session?.user && new URL(path, 'http://n').searchParams.get('report') === '1';
  const shown = !!session?.user && (clicked || autoOpen);

  useEffect(() => {
    if (autoOpen) ref.current?.scrollIntoView({ block: 'center' });
  }, [autoOpen]);

  async function open() {
    // 頁面剛打開、還在確認登入狀態時，等查詢完成再決定（不能忽略這次點擊）
    const s = session ?? (await loadSession());
    if (!s.user) setLogin(withReport(currentPath()));
    else setClicked(true);
  }

  const user = session?.user;
  return (
    <>
      <button className="btn" type="button" onClick={open} aria-expanded={shown}>
        回報修正
      </button>
      <div ref={ref} className="report-box">
        {shown &&
          user &&
          (user.banned ? (
            <p className="note err" role="status">
              帳號已停權，暫時不能回報修正。
            </p>
          ) : (
            <ReportForm
              placeId={placeId}
              options={options}
              userName={user.name}
              termsAccepted={user.termsAccepted}
              siteKey={session.turnstileSiteKey}
            />
          ))}
      </div>
      <LoginDialog
        open={login !== null}
        onClose={() => setLogin(null)}
        next={login ?? '/'}
        google={session?.providers.google ?? false}
      />
    </>
  );
}

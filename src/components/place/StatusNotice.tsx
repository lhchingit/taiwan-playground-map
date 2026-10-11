'use client';
// 維修中／已封閉的提醒。「是否已過預計恢復日期」要用今天的日期判斷，所以在瀏覽器計算（頁面本身是快取的）。
import { useSyncExternalStore } from 'react';
import { statusNotice, type StatusInfo } from '@/lib/place-detail';

const noSubscribe = () => () => {};
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' });
const todayTaipei = () => DAY.format(new Date());

export function StatusNotice({ status, info }: { status: string; info: StatusInfo | null }) {
  // 伺服器端產生時不知道今天（快取的頁面），不顯示「已過預計日期」，到瀏覽器再補上
  const today = useSyncExternalStore(noSubscribe, todayTaipei, () => '0000-00-00');
  const text = statusNotice(status, info, today);
  if (!text) return null;
  return (
    <p className="status-notice" role="note">
      {text}
      {info?.source && (
        <span className="asrc">
          {' '}
          {info.source.label}
          {info.verifiedAt && `．${info.verifiedAt}`}
        </span>
      )}
    </p>
  );
}

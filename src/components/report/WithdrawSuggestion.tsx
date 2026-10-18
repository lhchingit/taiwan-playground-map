'use client';
// 撤回自己還沒審核的修正建議（decisions D29）：按「撤回」後在頁面內確認，不用瀏覽器的 confirm。
// 「我的貢獻」與場地頁重複回報時共用。
import { useState, useTransition } from 'react';
import { withdrawSuggestion } from '@/app/me/actions';

export function WithdrawSuggestion({
  id,
  label = '撤回',
  onDone,
}: {
  id: number;
  label?: string;
  onDone?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const r = await withdrawSuggestion(id).catch(() => ({
        ok: false as const,
        message: '連線失敗，請稍後再試。',
      }));
      if (r.ok) {
        setConfirming(false);
        onDone?.();
      } else setMessage(r.message);
    });
  }

  return (
    <span className="withdraw">
      {confirming ? (
        <span role="group" aria-label="確認撤回">
          撤回這筆建議？{' '}
          <button type="button" className="btn danger" disabled={busy} onClick={run}>
            撤回
          </button>{' '}
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            取消
          </button>
        </span>
      ) : (
        <button type="button" className="btn" onClick={() => setConfirming(true)}>
          {label}
        </button>
      )}
      {message && (
        <span className="note err" role="alert">
          {message}
        </span>
      )}
    </span>
  );
}

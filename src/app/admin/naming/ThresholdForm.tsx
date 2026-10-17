'use client';
// 自動通過的門檻（只有管理員看得到這個表單；權限由資料庫函式把關）
import { useActionState } from 'react';
import { setNamingThreshold, type ThresholdState } from './actions';

const IDLE: ThresholdState = { ok: null, message: '' };

export function ThresholdForm({ value }: { value: number }) {
  const [state, action, pending] = useActionState(setNamingThreshold, IDLE);
  return (
    <form action={action} className="admin-filter" aria-label="自動通過門檻">
      <label>
        自動通過門檻（人）
        <input
          name="threshold"
          type="number"
          min={2}
          max={100}
          step={1}
          required
          defaultValue={value}
        />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        儲存
      </button>
      <span className={`note ${state.ok ? 'ok' : 'err'}`} role="status">
        {state.message}
      </span>
    </form>
  );
}

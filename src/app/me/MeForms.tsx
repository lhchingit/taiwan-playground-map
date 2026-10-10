'use client';

import { useActionState, useEffect, useState } from 'react';
import { refreshSession, useCurrentPath } from '@/components/auth/useSession';
import { type FormState, updateNickname } from './actions';

const IDLE: FormState = { status: 'idle', message: '' };

export function NicknameForm({ name, disabled }: { name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(updateNickname, IDLE);
  // 改好後讓頁首的暱稱跟著更新
  useEffect(() => {
    if (state.status === 'ok') refreshSession();
  }, [state]);
  return (
    <form action={action} className="me-form">
      <label htmlFor="nickname">暱稱（其他人只看得到暱稱）</label>
      <div className="me-row">
        <input
          id="nickname"
          name="name"
          defaultValue={name}
          maxLength={30}
          required
          disabled={disabled}
          autoComplete="nickname"
        />
        <button className="btn" type="submit" disabled={disabled || pending}>
          儲存
        </button>
      </div>
      <p className={state.status === 'error' ? 'note err' : 'note'} role="status">
        {state.message}
      </p>
    </form>
  );
}

const DELETE_ERROR: Record<string, string> = {
  confirm: '請輸入「刪除」兩個字確認。',
  failed: '帳號沒有刪除成功，請稍後再試。',
  origin: '帳號沒有刪除成功，請重新整理頁面再試一次。',
};

/** 刪除帳號：表單直接 POST（整頁導向首頁），錯誤時回到 /me?delete_error=… */
export function DeleteAccountForm() {
  const path = useCurrentPath();
  const fromUrl = new URL(path, 'http://n').searchParams.get('delete_error');
  const [message, setMessage] = useState<string | null>(null);
  const shown = message ?? (fromUrl ? (DELETE_ERROR[fromUrl] ?? DELETE_ERROR.failed) : '');
  return (
    <form
      action="/auth/delete-account"
      method="post"
      className="me-form"
      onSubmit={(e) => {
        const value = new FormData(e.currentTarget).get('confirm')?.toString().trim();
        if (value !== '刪除') {
          e.preventDefault();
          setMessage(DELETE_ERROR.confirm!);
        }
      }}
    >
      <p className="note">
        刪除後，你的個人資料與照片會一併刪除；已採納的修正會保留在場地資料裡，但不再顯示是誰提供的。這個動作無法復原。
      </p>
      <label htmlFor="confirm-delete">請輸入「刪除」確認</label>
      <div className="me-row">
        <input id="confirm-delete" name="confirm" autoComplete="off" required />
        <button className="btn danger" type="submit">
          刪除帳號
        </button>
      </div>
      <p className="note err" role="status">
        {shown}
      </p>
    </form>
  );
}

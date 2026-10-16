'use client';
// 登入視窗：按「回報修正」但還沒登入時跳出。用原生 <dialog>（Esc 關閉、焦點留在視窗內）。
import { useEffect, useRef } from 'react';
import { LoginPanel } from './LoginPanel';

export function LoginDialog(props: {
  open: boolean;
  onClose: () => void;
  next: string;
  google: boolean;
  email: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      className="login-dialog"
      aria-labelledby="login-dialog-title"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose(); // 點視窗外面關閉
      }}
    >
      <div className="login-dialog-body">
        <div className="login-dialog-head">
          <h2 id="login-dialog-title">登入</h2>
          <button className="btn" type="button" onClick={props.onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        {props.open && <LoginPanel next={props.next} google={props.google} email={props.email} />}
      </div>
    </dialog>
  );
}

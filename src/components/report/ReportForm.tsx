'use client';
// 回報修正的表單（沿用原型的 form.report）：設施或生活機能、停車、基本資料、封閉或維修。
// 送出後進入審核，審核通過才會更新場地資料。
import Link from 'next/link';
import { type ReactNode, startTransition, useActionState, useEffect, useId, useState } from 'react';
import { type ReportState, submitSuggestion } from '@/app/report/actions';
import { refreshSession } from '@/components/auth/useSession';
import {
  FIELD_OPTIONS,
  LIMITS,
  SUGGESTION_KINDS,
  type SuggestionKind,
} from '@/lib/suggestions/form';
import type { Tri } from '@/types/place';
import { Turnstile } from './Turnstile';
import { WithdrawSuggestion } from './WithdrawSuggestion';

export interface ReportOption {
  key: string;
  label: string;
  current: Tri;
}

/** 標籤＋欄位（用 htmlFor 綁定；select 不包在 label 裡，標籤名稱才不會混進選項文字） */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

const CURRENT: Record<Tri, string> = { y: '有', n: '沒有', u: '還沒有資料' };
const IDLE: ReportState = { status: 'idle', message: '' };

export function ReportForm(props: {
  placeId: string;
  options: readonly ReportOption[];
  userName: string;
  termsAccepted: boolean;
  siteKey: string | null;
}) {
  const [state, action, pending] = useActionState(submitSuggestion, IDLE);
  const [kind, setKind] = useState<SuggestionKind>('attribute');
  const [value, setValue] = useState<'y' | 'n'>('y');
  const [parkingType, setParkingType] = useState('lot');
  // 重複回報時撤回了那一筆（decisions D29）：提示可以重新送出
  const [withdrawn, setWithdrawn] = useState<number | null>(null);

  // 第一次送出成功後，同意條款的狀態改變了：讓其他元件重新查詢
  useEffect(() => {
    if (state.status === 'sent' && !props.termsAccepted) refreshSession();
  }, [state, props.termsAccepted]);

  if (state.status === 'sent') {
    return (
      <div className="report-done" role="status">
        <p className="ok">{state.message}</p>
        <p className="note">
          可以在 <Link href="/me">我的貢獻</Link> 看審核進度。
        </p>
      </div>
    );
  }

  return (
    <form
      className="report"
      aria-label="回報修正"
      // 不用 action={action}：React 送出後會重設表單，出錯時（例如重複回報、撤回後重新送出）使用者選的項目會跳回第一項
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="place_id" value={props.placeId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="seg" role="group" aria-label="回報類型">
        {SUGGESTION_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'attribute' && (
        <>
          <select name="key" aria-label="要修正的項目" required>
            {props.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}（目前：{CURRENT[o.current]}）
              </option>
            ))}
          </select>
          <input type="hidden" name="value" value={value} />
          <div className="seg" role="group" aria-label="實際狀況">
            {(['y', 'n'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={value === v} onClick={() => setValue(v)}>
                {v === 'y' ? '有' : '沒有'}
              </button>
            ))}
          </div>
          <input
            name="note"
            aria-label="補充說明（選填）"
            placeholder="補充說明（選填），例如：洗腳池在東側入口"
            maxLength={LIMITS.note}
          />
        </>
      )}

      {kind === 'parking' && (
        <>
          <Field label="停車類型">
            {(id) => (
              <select
                id={id}
                name="type"
                value={parkingType}
                onChange={(e) => setParkingType(e.target.value)}
              >
                <option value="lot">停車場</option>
                <option value="street">路邊停車格</option>
                <option value="none">沒有停車位</option>
              </select>
            )}
          </Field>
          {parkingType !== 'none' && (
            <>
              <Field label="費用">
                {(id) => (
                  <select id={id} name="fee" defaultValue="u">
                    <option value="free">免費</option>
                    <option value="paid">付費</option>
                    <option value="u">不確定</option>
                  </select>
                )}
              </Field>
              <Field label="停車格數（選填）">
                {(id) => (
                  <input
                    id={id}
                    name="spaces"
                    type="number"
                    min={0}
                    max={LIMITS.spaces}
                    inputMode="numeric"
                  />
                )}
              </Field>
              <Field label="費用說明（選填）">
                {(id) => (
                  <input
                    id={id}
                    name="fee_note"
                    placeholder="例如：每小時 30 元"
                    maxLength={LIMITS.feeNote}
                  />
                )}
              </Field>
            </>
          )}
          <input
            name="note"
            aria-label="補充說明（選填）"
            placeholder="補充說明（選填）"
            maxLength={LIMITS.note}
          />
        </>
      )}

      {kind === 'field' && (
        <>
          <Field label="欄位">
            {(id) => (
              <select id={id} name="field">
                {FIELD_OPTIONS.map((o) => (
                  <option key={o.field} value={o.field}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="內容">
            {(id) => (
              <input
                id={id}
                name="field_value"
                required
                maxLength={LIMITS.value}
                placeholder="例如：06:00–22:00，或：人工草皮、PU 地墊"
              />
            )}
          </Field>
        </>
      )}

      {kind === 'closure' && (
        <>
          <Field label="原因">
            {(id) => (
              <input
                id={id}
                name="reason"
                required
                maxLength={LIMITS.reason}
                placeholder="例如：遊具維修中、整修封閉"
              />
            )}
          </Field>
          <Field label="預計恢復日期（選填）">
            {(id) => <input id={id} name="until" type="date" />}
          </Field>
        </>
      )}

      {!props.termsAccepted && (
        <div className="report-terms">
          <label className="check">
            <input type="checkbox" name="agree" required />
            <span>
              我同意
              <Link href="/terms" target="_blank">
                服務條款
              </Link>
              ，貢獻的資料以 ODbL 授權公開
            </span>
          </label>
          <p className="note">
            其他人會看到你的暱稱「{props.userName}」，可以在 <Link href="/me">我的貢獻</Link> 修改。
          </p>
        </div>
      )}

      {props.siteKey && <Turnstile siteKey={props.siteKey} resetKey={state} />}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? '送出中…' : '送出修正建議'}
      </button>
      {state.status === 'error' && state.pendingId && withdrawn === state.pendingId ? (
        <p className="note ok" role="status">
          已撤回，可以重新送出。
        </p>
      ) : (
        <p className="note err" role="alert">
          {state.status === 'error' ? state.message : ''}
          {state.status === 'error' && state.pendingId !== undefined && (
            <WithdrawSuggestion
              key={state.pendingId}
              id={state.pendingId}
              label="撤回那一筆"
              onDone={() => setWithdrawn(state.pendingId ?? null)}
            />
          )}
        </p>
      )}
      <p className="note">送出後會先由審核員確認，通過才會更新場地資料。</p>
    </form>
  );
}

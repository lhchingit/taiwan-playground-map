'use client';
// 一處待命名點的決定表單：選票數表裡的名稱或自己輸入，或排除
import { useActionState } from 'react';
import { NAMING_BASES, NAMING_EXCLUDE_REASONS, NAMING_NAME_MAX } from '@/lib/naming';
import { resolveNaming, type ResolveState } from './actions';

const IDLE: ResolveState = { ok: false, message: '' };

export function ResolveForm(props: { id: string; city: string; names: string[] }) {
  const [state, action, pending] = useActionState(resolveNaming, IDLE);
  if (state.ok) return <p className="note ok">{state.message}</p>;
  return (
    <form action={action} className="report" aria-label={`決定 ${props.id}`}>
      <input type="hidden" name="id" value={props.id} />
      <input type="hidden" name="city" value={props.city} />
      {props.names.length > 0 && (
        <div className="field">
          <label htmlFor={`pick-${props.id}`}>採用的名稱</label>
          <select id={`pick-${props.id}`} name="pick" defaultValue={props.names[0]}>
            {props.names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={`custom-${props.id}`}>或自己輸入</label>
        <input id={`custom-${props.id}`} name="custom" maxLength={NAMING_NAME_MAX} />
      </div>
      <div className="field">
        <label htmlFor={`basis-${props.id}`}>依據</label>
        <select id={`basis-${props.id}`} name="basis" defaultValue={NAMING_BASES[0]}>
          {NAMING_BASES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="naming-actions">
        <button className="btn primary" type="submit" name="action" value="name" disabled={pending}>
          命名並加到地圖
        </button>
        <select name="reason" aria-label="排除的理由" defaultValue={NAMING_EXCLUDE_REASONS[0]}>
          {NAMING_EXCLUDE_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button className="btn" type="submit" name="action" value="exclude" disabled={pending}>
          排除
        </button>
      </div>
      <p className="note err" role="alert">
        {state.message}
      </p>
    </form>
  );
}

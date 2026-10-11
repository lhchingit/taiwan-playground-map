'use client';
// 審核後台的互動：每筆建議的對照與核准／退回、勾選批次處理、恢復開放。
import Link from 'next/link';
import { useActionState } from 'react';
import type { QueueGroup } from '@/lib/admin/queue';
import { REJECT_REASON_LABEL } from '@/lib/auth/labels';
import { FIELD_OPTIONS } from '@/lib/suggestions/form';
import type { Json } from '@/types/database';
import { reopenPlace, reviewBatch, reviewSuggestion, type ReviewState } from './actions';

export interface CurrentLine {
  text: string;
  source: string | null;
  verifiedAt: string | null;
}

export interface CardData {
  id: number;
  kind: string;
  kindLabel: string;
  placeId: string | null;
  placeName: string;
  cityName: string;
  payload: Json;
  createdAt: string;
  createdText: string;
  summary: string;
  note: string;
  submitter: { name: string; accepted: number } | null;
  current: CurrentLine[];
  /** 核准前可以修改的內容（基本資料、封閉或維修） */
  edit: Record<string, string> | null;
}

const EMPTY: ReviewState = { results: [] };

function Results({ state }: { state: ReviewState }) {
  if (!state.results.length) return null;
  return (
    <ul className="admin-results" role="status">
      {state.results.map((r, i) => (
        <li key={`${r.id}-${i}`} className={r.ok ? 'ok' : 'err'}>
          {r.id ? `#${r.id}：` : ''}
          {r.message}
        </li>
      ))}
    </ul>
  );
}

function ReasonSelect({ id }: { id: string }) {
  return (
    <select id={id} name="reason" defaultValue="unverifiable" aria-label="退回原因">
      {Object.entries(REJECT_REASON_LABEL).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

/** 一筆建議。審核結果由 AdminQueue 保存：核准後待審清單會重新產生，這張卡片就不在了 */
function Card({
  c,
  action,
  pending,
}: {
  c: CardData;
  action: (f: FormData) => void;
  pending: boolean;
}) {
  return (
    <li className="admin-card" aria-label={`#${c.id} ${c.placeName}`}>
      <div className="admin-card-head">
        <label className="check">
          <input type="checkbox" name="ids" value={c.id} form="batch" />
          <span>
            #{c.id}．
            <strong>
              {c.placeId ? (
                <Link href={`/admin/places/${c.placeId}`} title="修改紀錄">
                  {c.placeName}
                </Link>
              ) : (
                c.placeName
              )}
            </strong>
            （{c.cityName}）．{c.kindLabel}
          </span>
        </label>
        <span className="cmeta">{c.createdText}</span>
      </div>
      <div className="admin-compare">
        <div>
          <h4>目前</h4>
          {c.current.map((l, i) => (
            <p key={i}>
              {l.text}
              {l.source && (
                <span className="asrc">
                  <br />
                  {l.source}
                  {l.verifiedAt && `．${l.verifiedAt}`}
                </span>
              )}
            </p>
          ))}
        </div>
        <div>
          <h4>建議</h4>
          <p>
            <strong>{c.summary}</strong>
            {c.note && (
              <>
                <br />
                補充：{c.note}
              </>
            )}
          </p>
          <p className="asrc">
            {c.submitter
              ? `${c.submitter.name}．被採納過 ${c.submitter.accepted} 次`
              : '提交者已刪除帳號'}
          </p>
        </div>
      </div>

      <form action={action} className="admin-review">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="kind" value={c.kind} />
        {c.kind === 'field' && c.edit && (
          <fieldset>
            <legend>核准前可以修改</legend>
            <input type="hidden" name="edit_field" value={c.edit.field} />
            <label>
              {FIELD_OPTIONS.find((o) => o.field === c.edit?.field)?.label ?? c.edit.field}
              <input name="edit_value" defaultValue={c.edit.value} maxLength={100} />
            </label>
          </fieldset>
        )}
        {c.kind === 'closure' && c.edit && (
          <fieldset>
            <legend>核准前可以修改</legend>
            <label>
              狀態
              <select name="edit_status" defaultValue={c.edit.status}>
                <option value="maintenance">維修中</option>
                <option value="closed">已封閉</option>
              </select>
            </label>
            <label>
              原因
              <input name="edit_reason" defaultValue={c.edit.reason} maxLength={200} />
            </label>
            <label>
              預計恢復日期
              <input name="edit_until" type="date" defaultValue={c.edit.until} />
            </label>
          </fieldset>
        )}
        <label>
          審核說明（選填）
          <input name="review_note" maxLength={500} />
        </label>
        <div className="admin-actions">
          {c.kind !== 'new_place' && (
            <button className="btn primary" name="decision" value="accept" disabled={pending}>
              核准
            </button>
          )}
          <ReasonSelect id={`reason-${c.id}`} />
          <button className="btn danger" name="decision" value="reject" disabled={pending}>
            退回
          </button>
        </div>
        {c.kind === 'new_place' && (
          <p className="note">新增場地的核准還沒開放，目前只能保留或退回。</p>
        )}
      </form>
    </li>
  );
}

export function AdminQueue({ groups }: { groups: QueueGroup<CardData>[] }) {
  const [state, action, pending] = useActionState(reviewBatch, EMPTY);
  const [single, singleAction, singlePending] = useActionState(reviewSuggestion, EMPTY);
  if (!groups.length) {
    return (
      <section className="dsec">
        <Results state={single} />
        <Results state={state} />
        <p className="note">目前沒有待審的修正建議。</p>
      </section>
    );
  }
  return (
    <section className="dsec" aria-label="待審清單">
      <Results state={single} />
      <form id="batch" action={action} className="admin-batch">
        <span>勾選的建議：</span>
        <button className="btn primary" name="decision" value="accept" disabled={pending}>
          一次核准
        </button>
        <ReasonSelect id="batch-reason" />
        <button className="btn danger" name="decision" value="reject" disabled={pending}>
          一次退回
        </button>
      </form>
      <Results state={state} />
      <ol className="admin-groups">
        {groups.map((g) => (
          <li key={g.key} className={g.conflict ? 'admin-group conflict' : 'admin-group'}>
            {g.conflict && (
              <p className="admin-conflict" role="note">
                意見不一致：同一個項目有 {g.items.length} 筆不同的建議
              </p>
            )}
            <ul className="admin-cards">
              {g.items.map((c) => (
                <Card key={c.id} c={c} action={singleAction} pending={singlePending} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReopenList({ places }: { places: { id: string; name: string; text: string }[] }) {
  const [state, action, pending] = useActionState(reopenPlace, EMPTY);
  if (!places.length) {
    return (
      <>
        <Results state={state} />
        <p className="note">沒有維修中或已封閉的場地。</p>
      </>
    );
  }
  return (
    <>
      <ul className="me-list">
        {places.map((p) => (
          <li key={p.id}>
            <div>
              <strong>
                <Link href={`/admin/places/${p.id}`} title="修改紀錄">
                  {p.name}
                </Link>
              </strong>
              ．{p.text}
            </div>
            <form action={action} className="me-row">
              <input type="hidden" name="place_id" value={p.id} />
              <input
                name="note"
                aria-label={`${p.name}恢復開放的說明（選填）`}
                placeholder="說明（選填）"
              />
              <button className="btn" type="submit" disabled={pending}>
                恢復開放
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Results state={state} />
    </>
  );
}

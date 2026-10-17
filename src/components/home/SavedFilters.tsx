'use client';
// 我的篩選（decisions D27）：登入的人可以把目前條件存起來（最多 5 組），之後一鍵套用。
// 沒登入時只顯示提示與登入按鈕；看資料、篩選本身永遠不用登入。載入失敗不影響篩選。
import { useEffect, useState, useTransition } from 'react';
import {
  deleteSavedFilter,
  listSavedFilters,
  renameSavedFilter,
  saveFilter,
  type SavedFiltersResult,
} from '@/app/saved-filters/actions';
import type { SessionInfo } from '@/components/auth/useSession';
import { filtersToQuery, type Filters } from '@/lib/filter';
import type { AttributeCatalog } from '@/lib/places';
import {
  checkSavedName,
  defaultSavedName,
  MAX_SAVED_FILTERS,
  SAVED_NAME_MAX,
  type SavedFilter,
} from '@/lib/saved-filters';

interface Props {
  filters: Filters;
  catalog: AttributeCatalog;
  /** undefined：還在查詢登入狀態 */
  session: SessionInfo | undefined;
  onApply: (query: string) => void;
  onLogin: () => void;
}

/** 正在編輯的狀態：新增、改名、確認刪除 */
type Editing =
  | { kind: 'new'; name: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; id: string }
  | null;

export function SavedFilters({ filters, catalog, session, onApply, onLogin }: Props) {
  const signedIn = Boolean(session?.user);
  const [items, setItems] = useState<SavedFilter[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void listSavedFilters()
      .then((r) => {
        if (alive && r.ok) setItems(r.items);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (session === undefined) return null;

  if (!signedIn) {
    return (
      <div className="fgroup saved">
        <h3>我的篩選</h3>
        <p className="saved-login">
          登入後可以儲存篩選條件
          <button type="button" className="linkbtn" onClick={onLogin}>
            登入
          </button>
        </p>
      </div>
    );
  }

  const current = filtersToQuery(filters);
  const list = items ?? [];
  const full = list.length >= MAX_SAVED_FILTERS;
  const duplicate = list.find((s) => s.query === current);

  function run(action: () => Promise<SavedFiltersResult>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const r = await action().catch((): SavedFiltersResult => ({
        ok: false,
        message: '連線失敗，請稍後再試。',
      }));
      if (r.items) setItems(r.items);
      if (r.ok) {
        setEditing(null);
        after?.();
      } else setMessage(r.message);
    });
  }

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || editing.kind === 'delete') return;
    const err = checkSavedName(editing.name);
    if (err) return setMessage(err);
    if (editing.kind === 'new') run(() => saveFilter(editing.name, current));
    else run(() => renameSavedFilter(editing.id, editing.name));
  }

  const nameForm = editing && editing.kind !== 'delete' && (
    <form className="saved-form" onSubmit={submitName}>
      <input
        aria-label={editing.kind === 'new' ? '名稱' : '新的名稱'}
        value={editing.name}
        maxLength={SAVED_NAME_MAX + 5}
        autoFocus
        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
      />
      <button type="submit" className="btn primary" disabled={busy}>
        儲存
      </button>
      <button type="button" className="btn" onClick={() => setEditing(null)}>
        取消
      </button>
    </form>
  );

  return (
    <div className="fgroup saved">
      <h3>
        我的篩選
        <span className="saved-count">
          {list.length}／{MAX_SAVED_FILTERS}
        </span>
      </h3>
      {list.length > 0 && (
        <ul className="saved-list">
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="chip"
                aria-pressed={s.query === current}
                onClick={() => {
                  setMessage(null);
                  onApply(s.query);
                }}
              >
                {s.name}
              </button>
              <button
                type="button"
                className="saved-more"
                aria-label={`改名「${s.name}」`}
                title="改名"
                onClick={() => setEditing({ kind: 'rename', id: s.id, name: s.name })}
              >
                ✎
              </button>
              <button
                type="button"
                className="saved-more"
                aria-label={`刪除「${s.name}」`}
                title="刪除"
                onClick={() => setEditing({ kind: 'delete', id: s.id })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing?.kind === 'delete' && (
        <div className="saved-form" role="group" aria-label="確認刪除">
          <span>刪除「{list.find((s) => s.id === editing.id)?.name}」？</span>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => run(() => deleteSavedFilter(editing.id))}
          >
            刪除
          </button>
          <button type="button" className="btn" onClick={() => setEditing(null)}>
            取消
          </button>
        </div>
      )}
      {nameForm}

      {editing === null && (
        <>
          <button
            type="button"
            className="btn saved-add"
            disabled={busy || items === null || current === '' || full || Boolean(duplicate)}
            onClick={() => {
              setMessage(null);
              setEditing({ kind: 'new', name: defaultSavedName(filters, catalog) });
            }}
          >
            ＋儲存目前條件
          </button>
          <p className="fnote" role="status">
            {full
              ? `最多 ${MAX_SAVED_FILTERS} 組，請先刪掉一組。`
              : duplicate
                ? `目前條件已經存成「${duplicate.name}」。`
                : current === ''
                  ? '先選擇篩選條件，再按儲存。'
                  : ''}
          </p>
        </>
      )}
      {message && (
        <p className="saved-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

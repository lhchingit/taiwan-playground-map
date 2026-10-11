'use client';
// 修改紀錄的兩張表與還原按鈕。還原結果顯示在表格上方（還原後紀錄會重新產生）。
import { useActionState } from 'react';
import { restoreHistory, type RestoreState } from './actions';

export interface HistoryRow {
  id: number;
  at: string;
  item: string;
  from: string;
  to: string;
  by: string;
  note: string;
}

const IDLE: RestoreState = { ok: null, message: '' };

function Table(props: {
  title: string;
  type: 'attribute' | 'field';
  placeId: string;
  rows: HistoryRow[];
  action: (f: FormData) => void;
  pending: boolean;
}) {
  return (
    <section className="dsec" aria-label={props.title}>
      <h2 className="dsec-title">{props.title}</h2>
      {props.rows.length === 0 ? (
        <p className="note">還沒有紀錄。</p>
      ) : (
        <div className="history-scroll">
          <table className="history">
            <thead>
              <tr>
                <th scope="col">時間</th>
                <th scope="col">項目</th>
                <th scope="col">修改前</th>
                <th scope="col">修改後</th>
                <th scope="col">修改者</th>
                <th scope="col">說明</th>
                <th scope="col">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((r) => (
                <tr key={r.id} aria-label={`紀錄 #${r.id}`}>
                  <td>
                    #{r.id}
                    <br />
                    <span className="cmeta">{r.at}</span>
                  </td>
                  <td>{r.item}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td>{r.by}</td>
                  <td className="cmeta">{r.note}</td>
                  <td>
                    <form action={props.action}>
                      <input type="hidden" name="type" value={props.type} />
                      <input type="hidden" name="history_id" value={r.id} />
                      <input type="hidden" name="place_id" value={props.placeId} />
                      <button className="btn" type="submit" disabled={props.pending}>
                        回到這筆修改之前
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function HistoryTable(props: {
  placeId: string;
  attributes: HistoryRow[];
  fields: HistoryRow[];
}) {
  const [state, action, pending] = useActionState(restoreHistory, IDLE);
  return (
    <>
      {state.message && (
        <p className={state.ok ? 'note ok admin-flash' : 'note err admin-flash'} role="status">
          {state.message}
        </p>
      )}
      <Table
        title="設施與生活機能"
        type="attribute"
        placeId={props.placeId}
        rows={props.attributes}
        action={action}
        pending={pending}
      />
      <Table
        title="基本資料與狀態"
        type="field"
        placeId={props.placeId}
        rows={props.fields}
        action={action}
        pending={pending}
      />
    </>
  );
}

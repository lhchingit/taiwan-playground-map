'use client';
// 使用者列表與每一列的操作（角色、負責縣市、停權）。結果顯示在列表上方。
import { useActionState } from 'react';
import { roleLabel } from '@/lib/admin/history';
import { userAction, type UserActionState } from './actions';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  cities: string[];
  accepted: number;
  suggestions: number;
  bannedAt: string | null;
  banReason: string | null;
  createdAt: string;
  /** 自己：不能改自己的角色、不能停權自己 */
  self: boolean;
}

const IDLE: UserActionState = { ok: null, message: '' };
const ROLES = ['member', 'moderator', 'admin'] as const;

export function UsersTable({
  users,
  cities,
}: {
  users: UserRow[];
  cities: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(userAction, IDLE);
  const cityName = (c: string) => cities.find((x) => x.code === c)?.name ?? c;
  return (
    <section className="dsec" aria-label="使用者">
      {state.message && (
        <p className={state.ok ? 'note ok admin-flash' : 'note err admin-flash'} role="status">
          {state.message}
        </p>
      )}
      {users.length === 0 ? (
        <p className="note">找不到符合的使用者。</p>
      ) : (
        <ul className="admin-cards">
          {users.map((u) => (
            <li key={u.id} className="admin-card" aria-label={`使用者 ${u.name}`}>
              <div className="admin-card-head">
                <span>
                  <strong>{u.name}</strong>．{u.email}
                  {u.self && '（你）'}
                </span>
                <span className="cmeta">註冊 {u.createdAt}</span>
              </div>
              <p className="cmeta">
                {roleLabel(u.role)}
                {u.role === 'moderator' &&
                  `．負責：${u.cities.map(cityName).join('、') || '尚未指派'}`}
                ．建議 {u.suggestions} 筆、被採納 {u.accepted} 次
                {u.bannedAt && (
                  <>
                    ．
                    <span className="me-status rejected">
                      停權中（{u.bannedAt}：{u.banReason}）
                    </span>
                  </>
                )}
              </p>
              {u.self ? (
                <p className="note">不能修改自己的角色或停權自己，請由其他管理員處理。</p>
              ) : (
                <div className="admin-user-ops">
                  <form action={action} className="admin-actions">
                    <input type="hidden" name="op" value="role" />
                    <input type="hidden" name="user" value={u.id} />
                    <input type="hidden" name="name" value={u.name} />
                    <label>
                      角色
                      <select name="role" defaultValue={u.role}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn" type="submit" disabled={pending}>
                      儲存角色
                    </button>
                  </form>

                  {u.role === 'moderator' && (
                    <form action={action} className="admin-actions">
                      <input type="hidden" name="op" value="cities" />
                      <input type="hidden" name="user" value={u.id} />
                      <input type="hidden" name="name" value={u.name} />
                      <fieldset>
                        <legend>負責縣市</legend>
                        {cities.map((c) => (
                          <label key={c.code} className="check">
                            <input
                              type="checkbox"
                              name="cities"
                              value={c.code}
                              defaultChecked={u.cities.includes(c.code)}
                            />
                            {c.name}
                          </label>
                        ))}
                      </fieldset>
                      <button className="btn" type="submit" disabled={pending}>
                        儲存負責縣市
                      </button>
                    </form>
                  )}

                  {u.bannedAt ? (
                    <form action={action} className="admin-actions">
                      <input type="hidden" name="op" value="unban" />
                      <input type="hidden" name="user" value={u.id} />
                      <input type="hidden" name="name" value={u.name} />
                      <button className="btn" type="submit" disabled={pending}>
                        解除停權
                      </button>
                    </form>
                  ) : (
                    <form action={action} className="admin-actions">
                      <input type="hidden" name="op" value="ban" />
                      <input type="hidden" name="user" value={u.id} />
                      <input type="hidden" name="name" value={u.name} />
                      <label>
                        停權原因
                        <input name="reason" required maxLength={200} />
                      </label>
                      <button className="btn danger" type="submit" disabled={pending}>
                        停權
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

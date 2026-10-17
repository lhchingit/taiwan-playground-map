'use client';
// 幫忙命名（decisions D23）：選一處 → 看地圖與附近的 OSM 名稱 → 填名稱與依據（或建議排除）→ 送出。
// 只顯示每一處的參與人數，不顯示別人提的名稱（避免跟著別人填）。達到門檻（管理員設定）時資料庫立刻建立場地。
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import {
  myNamingVotes,
  voteNaming,
  type MyNamingVote,
  type NamingVoteResult,
} from '@/app/[city]/naming/actions';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { currentPath, refreshSession, useSession } from '@/components/auth/useSession';
import type { CityBounds } from '@/lib/cities';
import type { NamingCandidateView } from '@/lib/data';
import {
  NAMING_BASES,
  NAMING_EXCLUDE_REASONS,
  NAMING_NAME_MAX,
  type NamingAction,
} from '@/lib/naming';

const NamingMap = dynamic(() => import('./NamingMap'), {
  ssr: false,
  loading: () => <div className="mapmsg">地圖載入中…</div>,
});

const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };
const osmUrl = (ref: string) =>
  `https://www.openstreetmap.org/${OSM_TYPE[ref[0] ?? 'n']}/${ref.slice(1)}`;

export function NamingApp({
  city,
  candidates,
  threshold,
}: {
  city: CityBounds;
  candidates: NamingCandidateView[];
  /** 幾位不同會員一致就自動通過 */
  threshold: number;
}) {
  const session = useSession();
  const [items, setItems] = useState(candidates);
  const [selected, setSelected] = useState<string | null>(candidates[0]?.id ?? null);
  const [mine, setMine] = useState<Record<string, MyNamingVote>>({});
  const [name, setName] = useState('');
  const [basis, setBasis] = useState('');
  const [reason, setReason] = useState<string>(NAMING_EXCLUDE_REASONS[0]);
  const [agree, setAgree] = useState(false);
  const [result, setResult] = useState<NamingVoteResult | null>(null);
  const [login, setLogin] = useState(false);
  const [pending, start] = useTransition();
  const user = session?.user ?? null;
  const current = items.find((i) => i.id === selected) ?? null;

  // 自己投過的票（登入後才查）
  useEffect(() => {
    if (!user) return;
    void myNamingVotes(city.code).then((votes) =>
      setMine(Object.fromEntries(votes.map((v) => [v.candidateId, v]))),
    );
  }, [user, city.code]);

  // 換一處（或自己的票載入後）：表單換成自己的票，沒投過就清空。在 render 時調整，不用 effect
  const formKey = `${selected}|${selected && mine[selected] ? 'mine' : ''}`;
  const [formFor, setFormFor] = useState<string | null>(null);
  if (formFor !== formKey) {
    setFormFor(formKey);
    const v = selected ? mine[selected] : undefined;
    setName(v?.action === 'name' ? (v.name ?? '') : '');
    setBasis(v?.action === 'name' ? v.basis : '');
  }

  function goNext(from: string) {
    const i = items.findIndex((x) => x.id === from);
    const rest = items.filter((x) => x.id !== from);
    setSelected((rest[i] ?? rest[i - 1] ?? rest[0])?.id ?? null);
  }

  function submit(action: NamingAction) {
    if (!current) return;
    if (!user) {
      setLogin(true);
      return;
    }
    const id = current.id;
    start(async () => {
      const r = await voteNaming({
        city: city.code,
        candidateId: id,
        action,
        name: action === 'name' ? name : '',
        basis: action === 'name' ? basis : reason,
        agree,
      });
      setResult(r);
      if (r.status === 'error') return;
      if (!user.termsAccepted) refreshSession();
      if (r.status === 'named' || r.status === 'excluded') {
        const left = items.filter((x) => x.id !== id);
        setItems(left);
        goNext(id);
        return;
      }
      const isNew = !mine[id];
      setMine({
        ...mine,
        [id]: {
          candidateId: id,
          action,
          name: action === 'name' ? name.trim() : null,
          basis: action === 'name' ? basis : reason,
        },
      });
      if (isNew) setItems(items.map((x) => (x.id === id ? { ...x, votes: x.votes + 1 } : x)));
      goNext(id);
    });
  }

  const myVote = current ? mine[current.id] : undefined;

  return (
    <main className="app naming">
      <div className="side">
        <header className="head">
          <div className="head-top">
            <h1>幫忙命名</h1>
          </div>
          <p className="sub">
            {city.name}還有 {items.length} 處遊戲場沒有名稱．
            <Link href={`/${city.slug}`}>回到地圖</Link>
          </p>
          <p className="note naming-rule" role="note">
            請依地圖上看得到的名稱、現場告示或政府公告填寫，
            <strong>不可以用 Google 地圖查名稱</strong>
            ；查不到就換下一處。{threshold} 位會員提出相同名稱，就會加到地圖上。
          </p>
        </header>

        {current ? (
          <section className="naming-form" aria-label="命名">
            <h2>
              {current.district ?? '行政區未知'}的遊戲場{' '}
              <span className="note small">已有 {current.votes} 人參與</span>
            </h2>
            <p className="note small">
              <a href={osmUrl(current.osmRef)} target="_blank" rel="noopener">
                在 OpenStreetMap 開啟
              </a>
            </p>
            <div>
              <p className="note small">
                附近的 OSM 名稱（點一下填入，只是提示，請在地圖上確認）：
              </p>
              {current.nearby.length > 0 ? (
                <ul className="chips naming-hints">
                  {current.nearby.map((h) => (
                    <li key={h.osm}>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => {
                          setName(h.name);
                          setBasis(NAMING_BASES[0]);
                        }}
                      >
                        {h.name}
                        <span className="note small">
                          {' '}
                          {h.kind}．{h.distance_m} 公尺
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note small">附近沒有有名稱的地點。</p>
              )}
            </div>
            <form
              className="report"
              onSubmit={(e) => {
                e.preventDefault();
                submit('name');
              }}
            >
              <div className="field">
                <label htmlFor="nm-name">名稱</label>
                <input
                  id="nm-name"
                  value={name}
                  maxLength={NAMING_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="nm-basis">依據</label>
                <select id="nm-basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
                  <option value="">請選擇</option>
                  {NAMING_BASES.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
              {user && !user.termsAccepted && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  <span>
                    我同意
                    <Link href="/terms" target="_blank">
                      服務條款
                    </Link>
                    ，貢獻的資料以 ODbL 授權公開
                  </span>
                </label>
              )}
              <div className="naming-actions">
                <button className="btn primary" type="submit" disabled={pending}>
                  {pending ? '送出中…' : myVote ? '修改我的名稱' : '送出名稱'}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => current && goNext(current.id)}
                  disabled={pending || items.length < 2}
                >
                  跳過
                </button>
              </div>
              <div className="naming-exclude">
                <label htmlFor="nm-reason" className="note small">
                  不是公開的遊戲場？
                </label>
                <select id="nm-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {NAMING_EXCLUDE_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="button"
                  onClick={() => submit('exclude')}
                  disabled={pending}
                >
                  建議排除
                </button>
              </div>
              {myVote && (
                <p className="note small">
                  你提的：
                  {myVote.action === 'name' ? `「${myVote.name}」` : `排除（${myVote.basis}）`}
                </p>
              )}
              <p
                className={`note ${result?.status === 'error' ? 'err' : 'ok'}`}
                role={result?.status === 'error' ? 'alert' : 'status'}
              >
                {result?.message ?? ''}
              </p>
            </form>
          </section>
        ) : (
          <p className="note naming-done" role="status">
            {result?.message ? `${result.message} ` : ''}這個縣市目前沒有待命名的遊戲場了，謝謝！
          </p>
        )}

        <ul className="list naming-list" aria-label="待命名的遊戲場">
          {items.map((i, n) => (
            <li key={i.id}>
              <button
                type="button"
                className={`card${i.id === selected ? ' sel' : ''}`}
                aria-current={i.id === selected}
                onClick={() => setSelected(i.id)}
              >
                <span className="cnum">{n + 1}</span>
                {i.district ?? '行政區未知'}．已有 {i.votes} 人參與
                {mine[i.id] && <span className="note small">（你已參與）</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <section className="mapwrap" aria-label="地圖">
        {items.length > 0 && <NamingMap items={items} selected={selected} onSelect={setSelected} />}
      </section>
      <LoginDialog
        open={login}
        onClose={() => setLogin(false)}
        next={login ? currentPath() : `/${city.slug}/naming`}
        google={session?.providers.google ?? false}
        email={session?.providers.email ?? true}
      />
    </main>
  );
}

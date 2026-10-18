'use client';
// 回報新場地（首頁）：在地圖上點出位置 → 名稱、地址 → 送出，審核通過後出現在地圖上。
// 位置只用本站的 OpenStreetMap 底圖標示（decisions D19），不可以照 Google 地圖的位置標。
import Link from 'next/link';
import { startTransition, useActionState, useEffect } from 'react';
import { submitNewPlace, type ReportState } from '@/app/report/actions';
import { refreshSession, type SessionInfo } from '@/components/auth/useSession';
import { launchedCityAt, type CityBounds } from '@/lib/cities';
import type { Origin } from '@/lib/filter';
import { NEW_PLACE_LIMITS } from '@/lib/suggestions/form';
import { Turnstile } from './Turnstile';

const IDLE: ReportState = { status: 'idle', message: '' };

export function NewPlacePanel(props: {
  point: Origin | null;
  cities: readonly CityBounds[];
  session: SessionInfo;
  onRepick: () => void;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(submitNewPlace, IDLE);
  const user = props.session.user;
  const city = props.point ? launchedCityAt(props.point, props.cities) : null;

  useEffect(() => {
    if (state.status === 'sent' && user && !user.termsAccepted) refreshSession();
  }, [state, user]);

  return (
    <section className="newplace" aria-label="回報新場地">
      <div className="newplace-head">
        <h2>回報新場地</h2>
        <button className="btn" type="button" onClick={props.onClose} aria-label="關閉回報新場地">
          ✕
        </button>
      </div>
      {state.status === 'sent' ? (
        <div role="status">
          <p className="ok">{state.message}</p>
          <p className="note">
            可以在 <Link href="/me">我的貢獻</Link> 看審核進度。
          </p>
        </div>
      ) : !props.point ? (
        <p className="note" role="status">
          在地圖上點出場地的位置。請到現場確認，或對照地圖上的公園範圍；不要照 Google 地圖的位置標。
        </p>
      ) : (
        <form
          className="report"
          aria-label="新場地"
          // 不用 action={action}：React 送出後會重設表單，出錯時（例如驗證沒通過）填好的名稱、地址會被清掉
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => action(data));
          }}
        >
          <input type="hidden" name="lat" value={props.point.lat} />
          <input type="hidden" name="lng" value={props.point.lng} />
          <p className="cmeta">
            位置：{props.point.lat.toFixed(5)}, {props.point.lng.toFixed(5)}
            {city ? `（${city.name}）` : ''}{' '}
            <button className="linkbtn" type="button" onClick={props.onRepick}>
              重新標點
            </button>
          </p>
          {!city && (
            <p className="note err" role="alert">
              這個位置不在目前開放的縣市，請重新標點。
            </p>
          )}
          <div className="field">
            <label htmlFor="np-name">場地名稱</label>
            <input id="np-name" name="name" required maxLength={NEW_PLACE_LIMITS.name} />
          </div>
          <div className="field">
            <label htmlFor="np-address">地址（選填）</label>
            <input id="np-address" name="address" maxLength={NEW_PLACE_LIMITS.address} />
          </div>
          <div className="field">
            <label htmlFor="np-note">補充說明（選填）</label>
            <input
              id="np-note"
              name="note"
              maxLength={NEW_PLACE_LIMITS.note}
              placeholder="例如：公園西側的遊戲區，有溜滑梯和沙坑"
            />
          </div>
          {user && !user.termsAccepted && (
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
                其他人會看到你的暱稱「{user.name}」，可以在 <Link href="/me">我的貢獻</Link> 修改。
              </p>
            </div>
          )}
          {props.session.turnstileSiteKey && (
            <Turnstile siteKey={props.session.turnstileSiteKey} resetKey={state} />
          )}
          <button className="btn primary" type="submit" disabled={pending || !city}>
            {pending ? '送出中…' : '送出新場地'}
          </button>
          <p className="note err" role="alert">
            {state.status === 'error' ? state.message : ''}
          </p>
          <p className="note">審核員會在地圖上確認位置，通過後才會出現在地圖上。</p>
        </form>
      )}
    </section>
  );
}

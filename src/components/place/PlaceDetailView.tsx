// 場地詳情的內容（照原型的詳情面板）。沒有 hooks，場地頁（伺服器）與首頁面板（用戶端）共用。
import type { Origin, TravelMode } from '@/lib/filter';
import { estimateMinutes, TRAVEL_MODES } from '@/lib/filter';
import {
  ageText,
  formatKm,
  PARKING_FEE_LABEL,
  PARKING_TYPE_LABEL,
  SIZE_LABEL,
  stayText,
  TRI_LABEL,
} from '@/lib/format';
import {
  addressText,
  factSections,
  feeText,
  pageSources,
  type PlaceDetail,
  type SourceRef,
} from '@/lib/place-detail';
import type { AttributeCatalog } from '@/lib/places';
import type { Tri } from '@/types/place';
import { ReportButton } from './ReportButton';
import { RouteLink } from './RouteLink';

const ICON: Record<Tri, string> = { y: '✓', n: '–', u: '?' };

function SourceText({ source }: { source: SourceRef | null }) {
  if (!source) return null;
  return source.url ? (
    <a href={source.url} target="_blank" rel="noopener">
      {source.label}
    </a>
  ) : (
    <>{source.label}</>
  );
}

/** 說明＋「來源．確認日期」 */
function Provenance(p: {
  note: string | null;
  source: SourceRef | null;
  verifiedAt: string | null;
}) {
  if (!p.note && !p.source) return <span className="asrc">尚無資料</span>;
  return (
    <span>
      {p.note && (
        <>
          {p.note}
          <br />
        </>
      )}
      <span className="asrc">
        <SourceText source={p.source} />
        {p.verifiedAt && `．${p.verifiedAt}`}
      </span>
    </span>
  );
}

export interface PlaceDetailViewProps {
  detail: PlaceDetail;
  catalog: AttributeCatalog;
  /** 首頁面板才有：出發點、距離與交通方式 */
  trip?: { origin: Origin; km: number; mode: TravelMode } | null;
  /** 標題的 id（面板打開時把焦點移到標題） */
  titleId?: string;
  /** 場地頁用 h1，面板用 h2 */
  headingLevel?: 1 | 2;
}

export function PlaceDetailView({
  detail: d,
  catalog,
  trip,
  titleId,
  headingLevel = 2,
}: PlaceDetailViewProps) {
  // 標題層級依所在位置往下排（場地頁 h1 → h2 → h3；面板 h2 → h3 → h4），不能跳級
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const Sub = headingLevel === 1 ? 'h2' : 'h3';
  const Group = headingLevel === 1 ? 'h3' : 'h4';
  const minutes = trip ? estimateMinutes(trip.km, trip.mode) : null;

  return (
    <>
      <div className="dhead">
        <Heading id={titleId} tabIndex={-1}>
          {d.name}
        </Heading>
        <div className="cmeta">{addressText(d)}</div>
        {d.summary && <div>{d.summary}</div>}
        <div className="actions">
          <RouteLink dest={{ lat: d.lat, lng: d.lng }} origin={trip?.origin} mode={trip?.mode} />
          <ReportButton />
        </div>
      </div>

      <section className="dsec" aria-labelledby={`${d.id}-basic`}>
        <Sub id={`${d.id}-basic`} className="dsec-title">
          基本資料
        </Sub>
        <dl className="facts">
          {trip && (
            <>
              <dt>距離</dt>
              <dd>
                直線 {formatKm(trip.km)}
                {minutes !== null
                  ? `，${TRAVEL_MODES[trip.mode].label}約 ${minutes} 分鐘（估算）`
                  : '，大眾運輸請看 Google 地圖'}
              </dd>
            </>
          )}
          <dt>適合年齡</dt>
          <dd>{ageText(d)}</dd>
          <dt>建議停留</dt>
          <dd>
            {stayText(d.stay)}
            {d.staySource && (
              <>
                　<span className="asrc">{d.staySource.label}</span>
              </>
            )}
          </dd>
          <dt>規模</dt>
          <dd>
            {d.size ? SIZE_LABEL[d.size] : '未知'}
            {d.areaHa !== null && `（${d.areaHa} 公頃）`}
          </dd>
          <dt>費用</dt>
          <dd>{feeText(d.fee)}</dd>
          <dt>開放時間</dt>
          <dd>{d.hours ?? '未知'}</dd>
          <dt>地面材質</dt>
          <dd>{d.surface ?? '未知'}</dd>
          <dt>座標來源</dt>
          <dd className="asrc">{d.coordSource ?? '未知'}</dd>
        </dl>
      </section>

      {factSections(d.facts, catalog).map((s) => (
        <section className="dsec" key={s.title} aria-label={s.title}>
          <Sub className="dsec-title">{s.title}</Sub>
          {s.groups.map((g) => (
            <div key={g.name ?? s.title} className="agroup">
              {g.name && <Group className="agroup-title">{g.name}</Group>}
              {g.rows.map((r) => (
                <div className="arow" key={r.key}>
                  <span className={`st ${r.v}`} role="img" aria-label={TRI_LABEL[r.v]}>
                    {ICON[r.v]}
                  </span>
                  <span>{r.label}</span>
                  <Provenance note={r.note} source={r.source} verifiedAt={r.verifiedAt} />
                </div>
              ))}
            </div>
          ))}
          {s.unknown.length > 0 && <div className="unk">還沒有資料：{s.unknown.join('、')}</div>}
        </section>
      ))}

      <section className="dsec" aria-label="停車">
        <Sub className="dsec-title">停車</Sub>
        {d.parkingRows.map((p, i) => (
          <dl className="facts" key={i}>
            <dt>類型</dt>
            <dd>{PARKING_TYPE_LABEL[p.type]}</dd>
            <dt>費用</dt>
            <dd>
              {p.type === 'none' ? '—' : PARKING_FEE_LABEL[p.fee]}
              {p.feeNote && `（${p.feeNote}）`}
            </dd>
            <dt>格數</dt>
            <dd>{p.spaces !== null ? `${p.spaces} 格` : p.type === 'none' ? '—' : '未知'}</dd>
            {p.distanceM !== null && (
              <>
                <dt>距離</dt>
                <dd>步行約 {p.distanceM} 公尺</dd>
              </>
            )}
            <dt>說明</dt>
            <dd>
              <Provenance note={p.note} source={p.source} verifiedAt={p.verifiedAt} />
            </dd>
          </dl>
        ))}
      </section>

      <section className="dsec" aria-label="資料來源">
        <Sub className="dsec-title">資料來源</Sub>
        <ul className="srclist">
          {pageSources(d).map((s) => (
            <li key={s.id}>
              <SourceText source={s} />
            </li>
          ))}
          <li>座標與地圖資料 © OpenStreetMap contributors</li>
        </ul>
        <p className="note">
          網路文章與網友線索只是查證線索，內容已重新整理；看到不正確的地方，歡迎回報修正。
        </p>
      </section>
    </>
  );
}

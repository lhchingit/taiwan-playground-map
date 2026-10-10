'use client';

import type { Filters, TravelMode } from '@/lib/filter';
import {
  ageText,
  cardTags,
  distanceText,
  parkingFilterOn,
  parkingText,
  parkingTri,
  stayText,
  TRI_LABEL,
} from '@/lib/format';
import type { AttributeCatalog, CityPlace } from '@/lib/places';

interface Props {
  results: (CityPlace & { km: number })[];
  unknownHint: number;
  filters: Filters;
  catalog: AttributeCatalog;
  mode: TravelMode;
  selected: string | null;
  /** 場地頁網址（卡片是連結，搜尋引擎與「開新分頁」都能用） */
  placeHref: (id: string) => string;
  onSelect: (id: string) => void;
}

export function ResultList({
  results,
  unknownHint,
  filters,
  catalog,
  mode,
  selected,
  placeHref,
  onSelect,
}: Props) {
  const selectedKeys = [...filters.play, ...filters.amen];
  const showParking = parkingFilterOn(filters);

  return (
    <>
      <div className="resbar" aria-live="polite">
        <div>
          <strong data-testid="count">{results.length}</strong> 處符合
        </div>
        <div className="hint">{unknownHint > 0 ? `另有 ${unknownHint} 處資料未知` : ''}</div>
      </div>
      <ul className="list" data-testid="results">
        {results.length === 0 && (
          <li className="note" style={{ padding: 16 }}>
            沒有符合的場地。試著放寬距離，或開啟「包含資料未知的場地」。
          </li>
        )}
        {results.map((p, i) => {
          const pk = parkingTri(p.parking.type);
          return (
            <li key={p.id}>
              <a
                href={placeHref(p.id)}
                className={`card${selected === p.id ? ' sel' : ''}`}
                data-id={p.id}
                aria-current={selected === p.id ? 'true' : undefined}
                onClick={(e) => {
                  // 中鍵、Ctrl／Cmd 點擊照常開新分頁
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onSelect(p.id);
                }}
              >
                <div className="ctop">
                  <span className="cname">
                    <span className="cnum">{i + 1}</span>
                    {p.name}
                  </span>
                  <span className="cdist">{distanceText(p.km, mode)}</span>
                </div>
                <div className="cmeta">
                  {p.district ?? ''}．{ageText(p)}．停留 {stayText(p.stay)}
                  {p.status === 'seasonal' && (
                    <>
                      {' '}
                      ．<span className="pill">季節性開放</span>
                    </>
                  )}
                </div>
                <div className="tags">
                  {showParking && (
                    <span className={`tag ${pk}`}>
                      {pk === 'u' ? '?' : ''}停車：{parkingText(p.parking)}
                    </span>
                  )}
                  {cardTags(p.attrs, selectedKeys, catalog.order).map(({ key, v }) => (
                    <span key={key} className={`tag ${v}`} title={TRI_LABEL[v]}>
                      {v === 'u' ? '?' : ''}
                      {catalog.labels[key] ?? key}
                    </span>
                  ))}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

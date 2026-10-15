'use client';

import { useEffect, useRef } from 'react';
import { PlaceDetailView } from '@/components/place/PlaceDetailView';
import type { Origin, TravelMode } from '@/lib/filter';
import type { PlaceDetail } from '@/lib/place-detail';
import type { AttributeCatalog } from '@/lib/places';

export const PANEL_TITLE_ID = 'panel-title';

interface Props {
  detail: PlaceDetail | 'loading' | 'error';
  name: string;
  catalog: AttributeCatalog;
  trip: { origin: Origin; km: number; mode: TravelMode };
  onClose: () => void;
}

/** 首頁的場地詳情：桌機在地圖右側，手機是底部抽屜（CSS .detail） */
export function PlacePanel({ detail, name, catalog, trip, onClose }: Props) {
  // 面板打開時，不論焦點在哪裡，按 Esc 都會關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 手機只固定名稱與按鈕：量名稱的高度（可能折成兩行），按鈕貼在它下方（globals.css 的 --detail-title-h）
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panel.current;
    const title = el?.querySelector<HTMLElement>(`#${PANEL_TITLE_ID}`);
    if (!el || !title) return;
    const update = () =>
      el.style.setProperty('--detail-title-h', `${title.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(title);
    return () => ro.disconnect();
  }, [detail]);

  return (
    <section
      ref={panel}
      className="detail"
      aria-labelledby={PANEL_TITLE_ID}
      data-testid="place-panel"
    >
      <div className="dclose-wrap">
        <button className="dclose" type="button" aria-label="關閉" onClick={onClose}>
          ✕
        </button>
      </div>
      {typeof detail === 'string' ? (
        <div className="dhead">
          <h2 id={PANEL_TITLE_ID} tabIndex={-1}>
            {name}
          </h2>
          <p className="note" role="status">
            {detail === 'loading' ? '載入中…' : '詳細資料暫時載入失敗，請稍後再試。'}
          </p>
        </div>
      ) : (
        <PlaceDetailView detail={detail} catalog={catalog} trip={trip} titleId={PANEL_TITLE_ID} />
      )}
    </section>
  );
}

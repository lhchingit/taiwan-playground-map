'use client';

import { useState, type FormEvent } from 'react';
import { TRAVEL_MODES, type TravelMode } from '@/lib/filter';
import { searchAddress, type GeoResult } from '@/lib/geocode';
import type { NamedOrigin } from '@/lib/origin';

interface Props {
  origin: NamedOrigin;
  onOrigin: (o: NamedOrigin) => void;
  locating: boolean;
  onLocate: () => void;
  message: string | null;
  picking: boolean;
  onPickingChange: (on: boolean) => void;
  mode: TravelMode;
  onMode: (m: TravelMode) => void;
}

type Search =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'done'; results: GeoResult[] }
  | { state: 'error' };

export function OriginControls(props: Props) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<Search>({ state: 'idle' });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setSearch({ state: 'busy' });
    try {
      setSearch({ state: 'done', results: await searchAddress(query) });
    } catch {
      setSearch({ state: 'error' });
    }
  }

  return (
    <div className="origin">
      <div className="olabel" aria-live="polite">
        出發點：<b data-testid="origin-name">{props.message ?? props.origin.name}</b>
      </div>
      <div className="orow">
        <button className="btn primary" type="button" onClick={props.onLocate}>
          {props.locating ? '定位中…' : '使用目前位置'}
        </button>
        <button
          className={`btn${props.picking ? ' on' : ''}`}
          type="button"
          aria-pressed={props.picking}
          onClick={() => props.onPickingChange(!props.picking)}
        >
          在地圖上點選
        </button>
      </div>
      <form className="orow" role="search" onSubmit={onSubmit}>
        <input
          type="search"
          aria-label="地址或地標"
          placeholder="輸入地址或地標，例如：巨城購物中心"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" type="submit">
          搜尋
        </button>
      </form>
      <div className="geores">
        {search.state === 'busy' && <span className="note">搜尋中…</span>}
        {search.state === 'error' && (
          <span className="note">地址搜尋服務連不上，請改用「在地圖上點選」。</span>
        )}
        {search.state === 'done' && search.results.length === 0 && (
          <span className="note">找不到這個地址。試試加上「新竹市」，或改用地標名稱。</span>
        )}
        {search.state === 'done' &&
          search.results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                props.onOrigin({ lat: r.lat, lng: r.lng, name: r.name });
                setSearch({ state: 'idle' });
              }}
            >
              {r.label}
            </button>
          ))}
        {search.state !== 'idle' && (
          <span className="note">地址搜尋 © OpenStreetMap contributors</span>
        )}
      </div>
      <div className="seg" role="group" aria-label="交通方式">
        {(Object.keys(TRAVEL_MODES) as TravelMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={props.mode === m}
            onClick={() => props.onMode(m)}
          >
            {TRAVEL_MODES[m].label}
          </button>
        ))}
      </div>
    </div>
  );
}

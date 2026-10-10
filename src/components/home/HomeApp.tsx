'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { citiesToLoad, type CityBounds } from '@/lib/cities';
import { loadCityPlaces } from '@/lib/city-cache';
import { filterPlaces, filtersToQuery, queryToFilters, type Filters } from '@/lib/filter';
import { exampleOrigin, type NamedOrigin } from '@/lib/origin';
import type { AttributeCatalog, CityPlace } from '@/lib/places';
import { useTravelMode } from '@/lib/prefs';
import { FilterPanel } from './FilterPanel';
import { OriginControls } from './OriginControls';
import { ResultList } from './ResultList';

const PlaceMap = dynamic(() => import('./PlaceMap'), {
  ssr: false,
  loading: () => <div className="mapmsg">地圖載入中…</div>,
});

export interface HomeAppProps {
  city: CityBounds;
  cities: CityBounds[];
  catalog: AttributeCatalog;
  /** 這個縣市的場地（伺服器已取得） */
  places: CityPlace[];
  /** 網址的 query string（不含「?」） */
  query: string;
}

export function HomeApp({ city, cities, catalog, places, query }: HomeAppProps) {
  const known = useMemo(
    () => ({ play: catalog.playGroups.flatMap((g) => g.keys), amen: catalog.amenity }),
    [catalog],
  );
  const [filters, setFilters] = useState<Filters>(() => queryToFilters(query, known));
  const [origin, setOriginState] = useState<NamedOrigin>(() => exampleOrigin(city));
  const [fitSeq, setFitSeq] = useState(0);
  const [locating, setLocating] = useState(false);
  const [originMsg, setOriginMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useTravelMode();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const [otherCities, setOtherCities] = useState<Record<string, CityPlace[]>>({});
  const [failed, setFailed] = useState<string[]>([]);

  const setOrigin = useCallback((o: NamedOrigin) => {
    setOriginState(o);
    setOriginMsg(null);
    setFitSeq((n) => n + 1);
  }, []);

  // 出發點只留在瀏覽器：不寫進網址、不送到伺服器、不記錄
  const requestPosition = useCallback(
    (onFail: () => void) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: '目前位置' });
        },
        () => {
          setLocating(false);
          onFail();
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    },
    [setOrigin],
  );

  function locate() {
    if (!('geolocation' in navigator)) {
      setOriginMsg('這個瀏覽器不支援定位，請改輸入地址');
      return;
    }
    setLocating(true);
    requestPosition(() => setOriginMsg('無法取得定位，請改輸入地址或在地圖上點選'));
  }

  // 進入頁面時自動嘗試定位；失敗時不打擾，維持範例出發點
  useEffect(() => {
    if ('geolocation' in navigator) requestPosition(() => {});
  }, [requestPosition]);

  // 篩選條件同步到網址，方便分享
  useEffect(() => {
    const q = filtersToQuery(filters);
    const url = `${location.pathname}${q ? `?${q}` : ''}`;
    if (url !== `${location.pathname}${location.search}`) {
      history.replaceState(history.state, '', url);
    }
  }, [filters]);

  // 依出發點載入附近縣市（decisions D4）；這個頁面的縣市一定包含
  const codes = useMemo(
    () => [...new Set([city.code, ...citiesToLoad(origin, cities)])],
    [city.code, cities, origin],
  );
  useEffect(() => {
    let cancelled = false;
    for (const code of codes) {
      if (code === city.code) continue;
      loadCityPlaces(code)
        .then((data) => {
          if (cancelled) return;
          setOtherCities((d) => (d[code] === data ? d : { ...d, [code]: data }));
          setFailed((f) => f.filter((c) => c !== code));
        })
        .catch(() => {
          if (!cancelled) setFailed((f) => (f.includes(code) ? f : [...f, code]));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [codes, city.code]);

  const allPlaces = useMemo(
    () => codes.flatMap((c) => (c === city.code ? places : (otherCities[c] ?? []))),
    [codes, city.code, places, otherCities],
  );
  const { results, unknownHint } = useMemo(
    () => filterPlaces(allPlaces, filters, origin),
    [allPlaces, filters, origin],
  );
  const selectedId = selected && results.some((r) => r.id === selected) ? selected : null;
  const failedNames = failed.map((c) => cities.find((x) => x.code === c)?.name ?? c);

  return (
    <main className="app">
      <div className="side">
        <header className="head">
          <h1>竹市放電地圖</h1>
          <p className="sub">
            {city.name}親子遊樂場與公園．資料 {places.length} 處
          </p>
          <OriginControls
            origin={origin}
            onOrigin={setOrigin}
            locating={locating}
            onLocate={locate}
            message={originMsg}
            picking={picking}
            onPickingChange={setPicking}
            mode={mode}
            onMode={setMode}
          />
        </header>
        <div className="scroll">
          <FilterPanel filters={filters} onChange={setFilters} catalog={catalog} />
          {failedNames.length > 0 && (
            <p className="note" role="status" style={{ padding: '8px 16px', margin: 0 }}>
              {failedNames.join('、')}的資料暫時載入失敗，目前只顯示其他縣市。
            </p>
          )}
          <ResultList
            results={results}
            unknownHint={unknownHint}
            filters={filters}
            catalog={catalog}
            mode={mode}
            selected={selectedId}
            onSelect={(id) => {
              setSelected(id);
              setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
            }}
          />
        </div>
      </div>
      <section className="mapwrap" aria-label="地圖">
        <PlaceMap
          results={results}
          origin={origin}
          center={exampleOrigin(city)}
          selected={selectedId}
          picking={picking}
          onSelect={setSelected}
          onPick={(o) => {
            setPicking(false);
            setOrigin({
              ...o,
              name: `地圖上的點（${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}）`,
            });
          }}
          fitKey={String(fitSeq)}
          focus={focus}
        />
      </section>
    </main>
  );
}

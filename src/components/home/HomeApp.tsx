'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoginDialog } from '@/components/auth/LoginDialog';
import {
  currentPath,
  loadSession,
  useSession,
  type SessionInfo,
} from '@/components/auth/useSession';
import { NewPlacePanel } from '@/components/report/NewPlacePanel';
import { withFlag } from '@/lib/auth/next-path';
import { citiesToLoad, type CityBounds } from '@/lib/cities';
import { loadCityPlaces } from '@/lib/city-cache';
import { loadPlaceDetail } from '@/lib/detail-cache';
import {
  filterPlaces,
  filtersToQuery,
  haversineKm,
  passes,
  queryToFilters,
  type Filters,
  type Origin,
} from '@/lib/filter';
import { exampleOrigin, type NamedOrigin } from '@/lib/origin';
import type { PlaceDetail } from '@/lib/place-detail';
import type { AttributeCatalog, CityPlace } from '@/lib/places';
import { groupKeyMap } from '@/lib/play-groups';
import { useTravelMode } from '@/lib/prefs';
import { FilterPanel } from './FilterPanel';
import { OriginControls } from './OriginControls';
import { PANEL_TITLE_ID, PlacePanel } from './PlacePanel';
import { ResultList } from './ResultList';
import { SavedFilters } from './SavedFilters';
import { PlaygroundArt } from '@/components/home/PlaygroundArt';

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
  /** 待會員命名的遊戲場數（decisions D23）；0 時不顯示「幫忙命名」 */
  namingCount?: number;
}

/** history.state 裡標記「這一筆是打開詳情面板時加的」，關閉時用上一頁回到首頁網址 */
const PANEL_STATE = 'playmapPlace';

function placeIdFromPath(pathname: string, slug: string): string | null {
  const m = pathname.match(new RegExp(`^/${slug}/places/([^/]+)$`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function HomeApp({ city, cities, catalog, places, query, namingCount = 0 }: HomeAppProps) {
  const known = useMemo(
    () => ({
      play: catalog.playGroups.flatMap((g) => g.keys),
      amen: catalog.amenity,
      groups: Object.keys(groupKeyMap(catalog.playGroups)),
    }),
    [catalog],
  );
  const groupKeys = useMemo(() => groupKeyMap(catalog.playGroups), [catalog]);
  const [filters, setFilters] = useState<Filters>(() => queryToFilters(query, known));
  const [origin, setOriginState] = useState<NamedOrigin>(() => exampleOrigin(city));
  const [fitSeq, setFitSeq] = useState(0);
  const [locating, setLocating] = useState(false);
  const [originMsg, setOriginMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // 回報新場地：point 是 null 時在等使用者在地圖上點選位置
  const [newPlace, setNewPlace] = useState<{ point: Origin | null; session: SessionInfo } | null>(
    null,
  );
  const [loginNext, setLoginNext] = useState<string | null>(null);
  const [newPlaceMsg, setNewPlaceMsg] = useState<string | null>(null);
  const session = useSession();
  const [mode, setMode] = useTravelMode();
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const [otherCities, setOtherCities] = useState<Record<string, CityPlace[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, PlaceDetail | 'error'>>({});
  const lastOpened = useRef<string | null>(null);

  const startNewPlace = useCallback(async () => {
    setNewPlaceMsg(null);
    const s = await loadSession();
    if (!s.user) setLoginNext(withFlag(currentPath(), 'newplace'));
    else if (s.user.banned) setNewPlaceMsg('帳號已停權，暫時不能回報。');
    else {
      setPicking(false);
      setNewPlace({ point: null, session: s });
    }
  }, []);

  // 登入後回到首頁（?newplace=1）：直接進入標點模式
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('newplace') !== '1') return;
    void loadSession().then((s) => {
      if (s.user && !s.user.banned) setNewPlace({ point: null, session: s });
    });
  }, []);

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

  // 篩選條件同步到網址，方便分享（詳情面板打開時網址是場地頁，不動）
  useEffect(() => {
    if (selected) return;
    const q = filtersToQuery(filters);
    const url = `${location.pathname}${q ? `?${q}` : ''}`;
    if (url !== `${location.pathname}${location.search}`) {
      history.replaceState(history.state, '', url);
    }
  }, [filters, selected]);

  // 詳情面板與網址：打開時網址換成場地頁（可分享），關閉或上一頁時回到首頁原本的網址
  function openPlace(id: string, fly: boolean) {
    if (selected !== id) {
      const url = `/${city.slug}/places/${encodeURIComponent(id)}`;
      const state = { ...history.state, [PANEL_STATE]: id };
      // 從一個場地換到另一個時取代，按上一頁一次就回到首頁
      if (selected) history.replaceState(state, '', url);
      else history.pushState(state, '', url);
    }
    lastOpened.current = id;
    setSelected(id);
    if (fly) setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  }

  function closePlace() {
    if (history.state?.[PANEL_STATE]) history.back();
    else setSelected(null);
  }

  useEffect(() => {
    const onPop = () => {
      const id = placeIdFromPath(location.pathname, city.slug);
      setSelected(id);
      if (!id && lastOpened.current) {
        // 關閉後把焦點還給原本的卡片
        const card = document.querySelector<HTMLElement>(
          `a.card[data-id="${CSS.escape(lastOpened.current)}"]`,
        );
        card?.focus();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [city.slug]);

  useEffect(() => {
    if (!selected || details[selected]) return;
    let cancelled = false;
    loadPlaceDetail(selected)
      .then((d) => !cancelled && setDetails((m) => ({ ...m, [selected]: d })))
      .catch(() => !cancelled && setDetails((m) => ({ ...m, [selected]: 'error' })));
    return () => {
      cancelled = true;
    };
  }, [selected, details]);

  // 面板打開（或內容載入完成）時，把焦點移到標題
  const panelReady = selected ? (details[selected] ?? 'loading') : null;
  useEffect(() => {
    if (panelReady) document.getElementById(PANEL_TITLE_ID)?.focus({ preventScroll: true });
  }, [selected, panelReady]);

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
    () => filterPlaces(allPlaces, filters, origin, groupKeys),
    [allPlaces, filters, origin, groupKeys],
  );
  const selectedPlace = selected ? results.find((r) => r.id === selected) : undefined;
  const selectedId = selectedPlace ? selectedPlace.id : null;

  // 改篩選條件後，打開的場地不再符合時關閉面板（同原型）
  function changeFilters(f: Filters) {
    setFilters(f);
    const p = selected ? allPlaces.find((x) => x.id === selected) : undefined;
    if (p && !passes(p, haversineKm(origin, p), f, f.includeUnknown, groupKeys)) closePlace();
  }
  const failedNames = failed.map((c) => cities.find((x) => x.code === c)?.name ?? c);

  return (
    <main className="app">
      <div className="side">
        <header className="head">
          <div className="head-top">
            <h1>全台放電地圖</h1>
            <PlaygroundArt className="pa-mini" />
          </div>
          <p className="sub">
            {city.name}親子遊樂場與公園．資料 {places.length} 處
            {/* 兩個以上縣市上線時才有縣市選單（只有一個時 / 直接導向該縣市） */}
            {cities.filter((c) => c.launched).length > 1 && (
              <>
                ．<Link href="/">切換縣市</Link>
              </>
            )}
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
          <div className="newplace-entry">
            <button className="btn" type="button" onClick={() => void startNewPlace()}>
              回報新場地
            </button>
            {namingCount > 0 && (
              <Link className="btn" href={`/${city.slug}/naming`}>
                幫忙命名（{namingCount} 處）
              </Link>
            )}
            {newPlaceMsg && (
              <span className="note err" role="status">
                {newPlaceMsg}
              </span>
            )}
          </div>
        </header>
        {newPlace && (
          <NewPlacePanel
            point={newPlace.point}
            cities={cities}
            session={newPlace.session}
            onRepick={() => setNewPlace({ ...newPlace, point: null })}
            onClose={() => setNewPlace(null)}
          />
        )}
        <LoginDialog
          open={loginNext !== null}
          onClose={() => setLoginNext(null)}
          next={loginNext ?? '/'}
          google={session?.providers.google ?? false}
          email={session?.providers.email ?? true}
          googleClientId={session?.providers.googleClientId ?? null}
        />
        <div className="scroll">
          <FilterPanel
            filters={filters}
            onChange={changeFilters}
            catalog={catalog}
            saved={
              <SavedFilters
                filters={filters}
                catalog={catalog}
                session={session}
                onApply={(q) => changeFilters(queryToFilters(q, known))}
                onLogin={() => setLoginNext(currentPath())}
              />
            }
          />
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
            placeHref={(id) => `/${city.slug}/places/${encodeURIComponent(id)}`}
            onSelect={(id) => openPlace(id, true)}
          />
        </div>
      </div>
      <section className="mapwrap" aria-label="地圖">
        <PlaceMap
          results={results}
          origin={origin}
          center={exampleOrigin(city)}
          selected={selectedId}
          picking={picking || (newPlace !== null && newPlace.point === null)}
          pin={newPlace?.point ?? null}
          onSelect={(id) => openPlace(id, false)}
          onPick={(o) => {
            if (newPlace && !newPlace.point) {
              setNewPlace({ ...newPlace, point: o });
              return;
            }
            setPicking(false);
            setOrigin({
              ...o,
              name: `地圖上的點（${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}）`,
            });
          }}
          fitKey={String(fitSeq)}
          focus={focus}
        />
        {selectedPlace && (
          <PlacePanel
            detail={details[selectedPlace.id] ?? 'loading'}
            name={selectedPlace.name}
            catalog={catalog}
            trip={{ origin, km: selectedPlace.km, mode }}
            onClose={closePlace}
          />
        )}
      </section>
    </main>
  );
}

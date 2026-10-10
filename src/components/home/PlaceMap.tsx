'use client';

// 地圖：OpenFreeMap 向量圖磚，載入失敗或 7 秒沒載入時改用 CARTO 點陣圖磚（decisions D2，與原型相同）。
// 只在瀏覽器載入（HomeApp 用 next/dynamic 引入）。
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import MapGL, {
  Marker,
  NavigationControl,
  type MapRef,
  type StyleSpecification,
} from 'react-map-gl/maplibre';
import type { Origin } from '@/lib/filter';
import type { CityPlace } from '@/lib/places';

const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};
const FALLBACK_AFTER_MS = 7000;

// maplibre-gl 6 預設從主程式旁邊載入 worker，打包後找不到；改指向打包器輸出的檔案
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

export interface PlaceMapProps {
  results: (CityPlace & { km: number })[];
  origin: Origin;
  center: Origin;
  selected: string | null;
  picking: boolean;
  onSelect: (id: string) => void;
  onPick: (o: Origin) => void;
  /** 改變時把地圖縮放到出發點與所有結果 */
  fitKey: string;
  /** 改變時把地圖移到這個場地 */
  focus: { id: string; seq: number } | null;
}

export default function PlaceMap(props: PlaceMapProps) {
  const map = useRef<MapRef>(null);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState<string | StyleSpecification>(VECTOR_STYLE);

  // 最新的出發點與結果，給縮放用（不讓結果變化觸發縮放，跟原型一樣只在出發點改變時縮放）
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded.current) setStyle(RASTER_STYLE);
    }, FALLBACK_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  function fitAll() {
    const m = map.current;
    if (!m) return;
    const { origin, results } = latest.current;
    const pts = [origin, ...results];
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 15, duration: 600 },
    );
  }

  useEffect(() => {
    if (loaded.current) fitAll();
  }, [props.fitKey]);

  const focusSeq = props.focus?.seq;
  useEffect(() => {
    const m = map.current;
    const id = latest.current.focus?.id;
    const p = latest.current.results.find((r) => r.id === id);
    if (!m || !p) return;
    // 桌機的詳情面板在右側，把場地往左移，避免被面板蓋住（同原型）
    const offset: [number, number] = window.innerWidth > 820 ? [-190, 0] : [0, 0];
    m.flyTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 14.5), offset });
  }, [focusSeq]);

  return (
    <>
      {!ready && <div className="mapmsg">地圖載入中…</div>}
      <MapGL
        ref={map}
        initialViewState={{ longitude: props.center.lng, latitude: props.center.lat, zoom: 12 }}
        style={{ position: 'absolute', inset: 0 }}
        mapStyle={style}
        attributionControl={{ compact: true, customAttribution: '© OpenStreetMap contributors' }}
        cursor={props.picking ? 'crosshair' : undefined}
        onLoad={() => {
          loaded.current = true;
          setReady(true);
          fitAll();
        }}
        onError={() => {
          if (!loaded.current) setStyle(RASTER_STYLE);
        }}
        onClick={(e) => {
          if (props.picking) props.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        {props.results.map((p, i) => (
          <Marker
            key={p.id}
            longitude={p.lng}
            latitude={p.lat}
            anchor="bottom-left"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              props.onSelect(p.id);
            }}
          >
            <button
              type="button"
              className={`mk${props.selected === p.id ? ' sel' : ''}`}
              data-testid="marker"
              aria-label={`${i + 1}. ${p.name}`}
              title={p.name}
            >
              <span>{i + 1}</span>
            </button>
          </Marker>
        ))}
        <Marker longitude={props.origin.lng} latitude={props.origin.lat}>
          <div className="origin-mk" title="出發點" />
        </Marker>
      </MapGL>
    </>
  );
}

'use client';

// 地圖：OpenFreeMap 向量圖磚，載入失敗或 7 秒沒載入時改用 OSM 官方點陣圖磚（decisions D2；樣式在 src/lib/map-styles.ts）。
// 右下角可以切換彩色／灰階（預設彩色，記在 localStorage）。
// 只在瀏覽器載入（HomeApp 用 next/dynamic 引入）。
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import MapGL, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { MapColorControl } from '@/components/map/MapColorControl';
import type { Origin } from '@/lib/filter';
import {
  FALLBACK_AFTER_MS,
  FALLBACK_STYLE,
  OSM_ATTRIBUTION,
  VECTOR_STYLES,
} from '@/lib/map-styles';
import type { CityPlace } from '@/lib/places';
import { useMapColor } from '@/lib/prefs';

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
  /** 回報新場地時標的點 */
  pin?: Origin | null;
}

export default function PlaceMap(props: PlaceMapProps) {
  const map = useRef<MapRef>(null);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [color, setColor] = useMapColor();
  // 換頁時 Next.js 把上一頁藏起來（React <Activity>）而不是卸載；藏起來時地圖被拆掉，
  // 按「上一頁」回來會建立新的地圖，但標記仍綁在舊的地圖上（全部消失）。
  // 偵測到「重新顯示」就換 key，地圖與標記整組重新建立。
  // loaded 不歸零：主要圖磚在這一頁已經成功載入過，重建時的錯誤（例如被中斷的請求）不代表圖磚壞了，
  // 不能因此改用備援（OSM 點陣圖磚，彩色）。
  const [generation, setGeneration] = useState(0);
  const shownBefore = useRef(false);
  useEffect(() => {
    if (shownBefore.current) setGeneration((g) => g + 1);
    shownBefore.current = true;
  }, []);

  // 最新的出發點與結果，給縮放用（不讓結果變化觸發縮放，跟原型一樣只在出發點改變時縮放）
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // 主要圖磚多久沒載入完成就改用備援；已經載入過（例如按「上一頁」回來）就不用再等
  useEffect(() => {
    if (loaded.current) return;
    const t = setTimeout(() => {
      if (!loaded.current) setFallback(true);
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
      {/* 備援的 OSM 點陣圖磚是彩色的，灰階時用 CSS 濾鏡轉灰（globals.css） */}
      <div
        className={`map${fallback && color === 'gray' ? ' map-gray-raster' : ''}`}
        data-testid="map"
        data-color={color}
      >
        <MapGL
          key={generation}
          ref={map}
          initialViewState={{ longitude: props.center.lng, latitude: props.center.lat, zoom: 12 }}
          style={{ position: 'absolute', inset: 0 }}
          mapStyle={fallback ? FALLBACK_STYLE : VECTOR_STYLES[color]}
          attributionControl={{ compact: true, customAttribution: OSM_ATTRIBUTION }}
          cursor={props.picking ? 'crosshair' : undefined}
          onLoad={() => {
            loaded.current = true;
            setReady(true);
            fitAll();
          }}
          onError={(e) => {
            // 只有主要圖磚從來沒載入成功時才改用備援；被中斷的請求（換頁、重建地圖）不算失敗
            if (loaded.current || e.error?.name === 'AbortError') return;
            setFallback(true);
          }}
          onClick={(e) => {
            if (props.picking) props.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          {/* 後加的控制項排在上面：顏色切換在縮放鈕上方 */}
          <MapColorControl color={color} onChange={setColor} />
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
          {props.pin && (
            <Marker longitude={props.pin.lng} latitude={props.pin.lat} anchor="bottom">
              <div className="newplace-mk" title="新場地的位置" data-testid="newplace-pin" />
            </Marker>
          )}
        </MapGL>
      </div>
    </>
  );
}

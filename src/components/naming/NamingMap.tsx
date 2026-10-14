'use client';

// 幫忙命名的地圖：待命名的點；選中的點放大並移到中心。樣式與首頁相同（OpenFreeMap，失敗時改用 OSM 圖磚，decisions D2）。
// 只在瀏覽器載入（NamingApp 用 next/dynamic 引入）。
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import MapGL, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { MapColorControl } from '@/components/map/MapColorControl';
import type { NamingCandidateView } from '@/lib/data';
import {
  FALLBACK_AFTER_MS,
  FALLBACK_STYLE,
  OSM_ATTRIBUTION,
  VECTOR_STYLES,
} from '@/lib/map-styles';
import { useMapColor } from '@/lib/prefs';

setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

export default function NamingMap(props: {
  items: NamingCandidateView[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useRef<MapRef>(null);
  const loaded = useRef(false);
  const [fallback, setFallback] = useState(false);
  const [color, setColor] = useMapColor();
  const current = props.items.find((i) => i.id === props.selected) ?? props.items[0];

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded.current) setFallback(true);
    }, FALLBACK_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  // 選中的點移到中心（看得到公園、學校的名稱的縮放層級）
  useEffect(() => {
    if (current) map.current?.flyTo({ center: [current.lng, current.lat], zoom: 17 });
  }, [current]);

  return (
    <div
      className={`map${fallback && color === 'gray' ? ' map-gray-raster' : ''}`}
      data-testid="map"
    >
      <MapGL
        ref={map}
        initialViewState={
          current ? { longitude: current.lng, latitude: current.lat, zoom: 17 } : undefined
        }
        style={{ position: 'absolute', inset: 0 }}
        mapStyle={fallback ? FALLBACK_STYLE : VECTOR_STYLES[color]}
        attributionControl={{ compact: true, customAttribution: OSM_ATTRIBUTION }}
        onLoad={() => {
          loaded.current = true;
        }}
        onError={(e) => {
          if (loaded.current || e.error?.name === 'AbortError') return;
          setFallback(true);
        }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <MapColorControl color={color} onChange={setColor} />
        {props.items.map((i) => (
          <Marker
            key={i.id}
            longitude={i.lng}
            latitude={i.lat}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              props.onSelect(i.id);
            }}
          >
            <button
              type="button"
              className={`naming-mk${i.id === current?.id ? ' sel' : ''}`}
              aria-label={`待命名：${i.district ?? ''} ${i.osmRef}`}
              data-testid="naming-marker"
            />
          </Marker>
        ))}
      </MapGL>
    </div>
  );
}

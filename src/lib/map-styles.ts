// 地圖樣式（decisions D2）：OpenFreeMap 向量圖磚；載入失敗時改用 OSM 官方點陣圖磚。
import type { StyleSpecification } from 'maplibre-gl';

export const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/**
 * 備援：OSM 官方圖磚。只在主要圖磚失敗時使用，流量很小，符合 OSM 圖磚使用政策
 * （https://operations.osmfoundation.org/policies/tiles/）：不預先下載、不大量抓取、
 * 不偽造標頭，並標示連到 osm.org/copyright 的版權（見 OSM_ATTRIBUTION）。
 * 使用量變大時依 D2 改成自架（Protomaps PMTiles）。
 */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19, // OSM 圖磚最高 19 級
      // 版權由地圖的 customAttribution 統一顯示，這裡留空避免重複
      attribution: '',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** 主要圖磚多久沒載入完成就改用備援 */
export const FALLBACK_AFTER_MS = 7000;

/** 地圖右下角的版權標示（OSM 政策要求連到 copyright 頁） */
export const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

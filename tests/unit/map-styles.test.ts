import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_COLOR,
  FALLBACK_STYLE,
  OSM_ATTRIBUTION,
  VECTOR_STYLES,
} from '@/lib/map-styles';
import { parseMapColor } from '@/lib/prefs';

describe('地圖樣式（decisions D2）', () => {
  it('主要圖磚是 OpenFreeMap：彩色 liberty（預設）、灰階 positron', () => {
    expect(VECTOR_STYLES).toEqual({
      color: 'https://tiles.openfreemap.org/styles/liberty',
      gray: 'https://tiles.openfreemap.org/styles/positron',
    });
    expect(DEFAULT_MAP_COLOR).toBe('color');
  });

  it('地圖顏色的偏好設定：沒有或看不懂就用彩色', () => {
    expect(parseMapColor(null)).toBe('color');
    expect(parseMapColor('{"color":"gray"}')).toBe('gray');
    expect(parseMapColor('{"color":"color"}')).toBe('color');
    expect(parseMapColor('{"color":"sepia"}')).toBe('color');
    expect(parseMapColor('不是 JSON')).toBe('color');
  });

  it('備援是 OSM 官方圖磚，最高 19 級，不再使用 CARTO', () => {
    const src = FALLBACK_STYLE.sources.osm;
    expect(src).toMatchObject({
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
    });
    expect(JSON.stringify(FALLBACK_STYLE)).not.toMatch(/carto/i);
  });

  it('版權標示連到 osm.org/copyright', () => {
    expect(OSM_ATTRIBUTION).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(OSM_ATTRIBUTION).toContain('© OpenStreetMap contributors');
  });
});

import { describe, expect, it } from 'vitest';
import { FALLBACK_STYLE, OSM_ATTRIBUTION, VECTOR_STYLE } from '@/lib/map-styles';

describe('地圖樣式（decisions D2）', () => {
  it('主要圖磚是 OpenFreeMap', () => {
    expect(VECTOR_STYLE).toBe('https://tiles.openfreemap.org/styles/positron');
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

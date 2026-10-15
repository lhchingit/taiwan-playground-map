'use client';
// 地圖顏色切換（彩色／灰階，decisions D2）：放在 NavigationControl 後面，就會排在縮放鈕上方。
import { createPortal } from 'react-dom';
import { useControl, type IControl } from 'react-map-gl/maplibre';
import type { MapColor } from '@/lib/map-styles';

/** 地圖控制項的容器（MapLibre 的 ctrl 樣式，跟縮放鈕一致）；內容用 React portal 畫進去 */
class PortalControl implements IControl {
  el = document.createElement('div');
  constructor() {
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group map-color-ctrl';
  }
  onAdd() {
    return this.el;
  }
  onRemove() {
    this.el.remove();
  }
}

export function MapColorControl({
  color,
  onChange,
}: {
  color: MapColor;
  onChange: (c: MapColor) => void;
}) {
  const ctrl = useControl(() => new PortalControl(), { position: 'bottom-right' });
  const next: MapColor = color === 'gray' ? 'color' : 'gray';
  return createPortal(
    <button
      type="button"
      data-testid="map-color"
      aria-pressed={color === 'gray'}
      aria-label={next === 'gray' ? '地圖改成灰階' : '地圖改成彩色'}
      title={next === 'gray' ? '地圖改成灰階' : '地圖改成彩色'}
      onClick={() => onChange(next)}
    >
      {next === 'gray' ? '灰階' : '彩色'}
    </button>,
    ctrl.el,
  );
}

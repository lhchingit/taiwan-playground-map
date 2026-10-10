import type { CityBounds } from './cities';
import type { Origin } from './filter';

export interface NamedOrigin extends Origin {
  /** 顯示在「出發點：」後面 */
  name: string;
}

/** 定位失敗或還沒定位時的範例出發點，名稱標示「範例」 */
const EXAMPLES: Readonly<Record<string, NamedOrigin>> = {
  hsc: { lat: 24.80163, lng: 120.97163, name: '新竹火車站（範例）' },
};

export function exampleOrigin(city: CityBounds): NamedOrigin {
  const known = EXAMPLES[city.code];
  if (known) return known;
  // 還沒有指定範例的縣市：用範圍的中心
  const [w, s, e, n] = (city.bbox ?? [120.97, 24.8, 120.97, 24.8]) as number[];
  return {
    lat: ((s ?? 0) + (n ?? 0)) / 2,
    lng: ((w ?? 0) + (e ?? 0)) / 2,
    name: `${city.name}中心（範例）`,
  };
}

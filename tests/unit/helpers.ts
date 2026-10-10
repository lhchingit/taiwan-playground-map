import { readFileSync } from 'node:fs';
import type { FilterPlace } from '@/lib/filter';
import type { Place, SeedFile, Tri } from '@/types/place';

/** places.json 的場地 → 篩選用的形狀（attrs 從 {key: {v}} 攤平成 {key: v}） */
export function toFilterPlace(p: Place): FilterPlace {
  const attrs: Record<string, Tri> = {};
  for (const [k, a] of Object.entries(p.attrs)) attrs[k] = a.v;
  return { ...p, attrs };
}

export function loadSeedPlaces(): FilterPlace[] {
  const seed = JSON.parse(readFileSync('data/seed/places.json', 'utf8')) as SeedFile;
  return seed.places.map(toFilterPlace);
}

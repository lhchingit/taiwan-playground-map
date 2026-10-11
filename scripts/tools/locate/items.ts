// 人工定位工具要處理的清單。
// 新竹市：直接從清冊原始資料算（不讀 review CSV），
// 這樣已經定位、重新匯入之後，項目也不會從工具裡消失。
// 規則跟 scripts/sources/hccg.py 相同：清冊有遊具、而且 OSM 沒有座標 → 找不到座標；
// 有座標但比對方式不確定（review*／*spread／contains）→ 待確認比對。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReviewFile, type ReviewEntry } from './review-file';

export interface ParkHint {
  location: string;
  village: string;
  district: string;
  areaHa: string;
}

export interface LocateItem {
  no: string;
  name: string;
  district: string;
  items: string;
  kind: 'unmatched' | 'match-review';
  osm: { id: string; method: string; lat: number; lng: number } | null;
  hint: ParkHint | null;
  review: ReviewEntry | null;
}

export const PATHS = {
  hccg: 'data/raw/hsc/hccg-playgrounds.tsv',
  osm: 'data/raw/hsc/osm-matches.tsv',
  parks: 'data/raw/hsc/hccg-parks.json',
  review: 'data/raw/hsc/manual-review.tsv',
  seed: 'data/seed/hsc/places.json',
} as const;

function readTsv(path: string): string[][] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))
    .map((l) => l.split('\t'));
}

const hasItems = (text: string) => !['', '無'].includes(text.trim().replace(/。$/, ''));
const uncertain = (method: string) =>
  method.startsWith('review') || method.endsWith('spread') || method === 'contains';

/** 每個縣市的檔案位置（新竹市的清冊相關檔案見上面的 PATHS） */
export function cityPaths(city: string) {
  return {
    review: `data/raw/${city}/manual-review.tsv`,
    seed: `data/seed/${city}/places.json`,
    toLocate: `data/review/${city}/to-locate.json`,
  };
}

export function readReviewEntries(root: string, city = 'hsc'): ReviewEntry[] {
  const path = join(root, cityPaths(city).review);
  return existsSync(path) ? parseReviewFile(readFileSync(path, 'utf8')) : [];
}

/**
 * 其他縣市：讀轉接器輸出的 data/review/<縣市>/to-locate.json
 * （例：scripts/import_tycg.py 產生的桃園市待定位、待確認比對清單）
 */
function loadCityItems(root: string, city: string): LocateItem[] {
  const path = join(root, cityPaths(city).toLocate);
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8')) as {
    items: {
      no: string;
      name: string;
      district: string;
      items: string;
      address: string;
      kind: LocateItem['kind'];
      osm: LocateItem['osm'];
    }[];
  };
  const reviews = new Map(readReviewEntries(root, city).map((e) => [e.no, e]));
  return data.items.map((i) => ({
    no: i.no,
    name: i.name,
    district: i.district,
    items: i.items,
    kind: i.kind,
    osm: i.osm,
    hint: { location: i.address, village: '', district: i.district, areaHa: '' },
    review: reviews.get(i.no) ?? null,
  }));
}

export function loadItems(root: string, city = 'hsc'): LocateItem[] {
  if (city !== 'hsc') return loadCityItems(root, city);
  const osm = new Map(readTsv(join(root, PATHS.osm)).map((r) => [r[0], r]));
  const parks = new Map<string, ParkHint>();
  const parksPath = join(root, PATHS.parks);
  if (existsSync(parksPath)) {
    const data = JSON.parse(readFileSync(parksPath, 'utf8')) as {
      records: Record<string, string>[];
    };
    for (const r of data.records) {
      parks.set((r['公園名稱'] ?? '').trim(), {
        location: r['地點'] ?? '',
        village: r['里別'] ?? '',
        district: r['區別'] ?? '',
        areaHa: r['面積公頃'] ?? '',
      });
    }
  }
  const reviews = new Map(readReviewEntries(root).map((e) => [e.no, e]));

  const out: LocateItem[] = [];
  for (const [no = '', name = '', district = '', text = ''] of readTsv(join(root, PATHS.hccg))) {
    if (!hasItems(text)) continue;
    const m = osm.get(no);
    const method = m?.[2] ?? 'none';
    const coord = m?.[4] ? { lat: Number(m[4]), lng: Number(m[5]) } : null;
    const kind = !coord ? 'unmatched' : uncertain(method) ? 'match-review' : null;
    if (!kind) continue;
    out.push({
      no,
      name,
      district: district.replace('公所', ''),
      items: text,
      kind,
      osm: coord ? { id: m?.[3] ?? '', method, ...coord } : null,
      hint: parks.get(name.trim()) ?? null,
      review: reviews.get(no) ?? null,
    });
  }
  return out;
}

/** 地圖上的參考點：已經上地圖的場地（避免重複定位） */
export function loadPlaces(
  root: string,
  city = 'hsc',
): { id: string; name: string; lat: number; lng: number }[] {
  const path = join(root, cityPaths(city).seed);
  if (!existsSync(path)) return [];
  const seed = JSON.parse(readFileSync(path, 'utf8')) as {
    places: { id: string; name: string; lat: number; lng: number }[];
  };
  return seed.places.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));
}

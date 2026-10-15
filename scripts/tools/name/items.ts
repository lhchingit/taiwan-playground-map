// 人工命名工具要處理的清單（跟 scripts/fetch_osm_nearby.py 的 queue() 相同）：
//   - data/review/<縣市>/unnamed.csv：沒有名稱的 OSM 遊戲場
//   - data/review/tyc/osm-near-official.csv：離官方場地很近、名稱不同（同一處就排除，不同處就命名）
//   - data/review/tpe/odd-names.csv：名稱是用地編號（只能命名）
//   - data/review/tnn/named-suspicious.csv：OSM 上有名稱但不像公共遊戲場（是就照名稱命名，不是就排除）
// 附近的 OSM 名稱來自 data/raw/<縣市>/osm-nearby.json（只是提示）；已經處理的結果來自 manual-names.tsv。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNamesFile, type KeyColumn, type NameEntry } from './names-file';

export interface City {
  code: string;
  name: string;
  key: KeyColumn;
  allowExclude: boolean;
  /** 命名完成後要執行的匯入指令 */
  importCmd: string;
}

export const CITIES: readonly City[] = [
  {
    code: 'hsq',
    name: '新竹縣',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py hsq',
  },
  {
    code: 'tyc',
    name: '桃園市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_tycg.py',
  },
  {
    code: 'mlc',
    name: '苗栗縣',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py mlc',
  },
  {
    code: 'tpe',
    name: '臺北市',
    key: '編號',
    allowExclude: false,
    importCmd: 'python scripts/import_pkl.py',
  },
  {
    code: 'nwt',
    name: '新北市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py nwt',
  },
  {
    code: 'txg',
    name: '臺中市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py txg',
  },
  {
    code: 'khh',
    name: '高雄市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py khh',
  },
  {
    code: 'tnn',
    name: '臺南市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_tnn.py',
  },
  {
    code: 'cyi',
    name: '嘉義市',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py cyi',
  },
  {
    code: 'chw',
    name: '彰化縣',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py chw',
  },
  {
    code: 'pif',
    name: '屏東縣',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py pif',
  },
  {
    code: 'yun',
    name: '雲林縣',
    key: 'OSM',
    allowExclude: true,
    importCmd: 'python scripts/import_osm_city.py yun',
  },
];

export interface Nearby {
  name: string;
  kind: string;
  osm: string;
  distance_m: number;
}

export interface NameItem {
  city: string;
  key: string;
  kind: 'unnamed' | 'near-official' | 'odd-name' | 'suspicious';
  lat: number;
  lng: number;
  district: string;
  /** 離官方場地很近：官方場地與距離；用地編號：原本的名稱 */
  context: string;
  /** OSM 物件的網址（臺北的用地編號沒有） */
  osmUrl: string | null;
  nearby: Nearby[];
  done: NameEntry | null;
}

/** 讀 CSV（有 BOM、欄位裡可能有逗號與引號） */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [head = [], ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };
export const osmUrl = (ref: string) =>
  OSM_TYPE[ref[0] ?? '']
    ? `https://www.openstreetmap.org/${OSM_TYPE[ref[0]!]}/${ref.slice(1)}`
    : null;

const readCsv = (path: string) => (existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : []);

export const namesPath = (city: string) => `data/raw/${city}/manual-names.tsv`;

export function readNames(root: string, city: string): NameEntry[] {
  const path = join(root, namesPath(city));
  return existsSync(path) ? parseNamesFile(readFileSync(path, 'utf8')) : [];
}

export function loadItems(root: string, city: string): NameItem[] {
  const review = join(root, 'data/review', city);
  const nearbyPath = join(root, 'data/raw', city, 'osm-nearby.json');
  const nearby: Record<string, Nearby[]> = existsSync(nearbyPath)
    ? (JSON.parse(readFileSync(nearbyPath, 'utf8')) as { nearby: Record<string, Nearby[]> }).nearby
    : {};
  const done = new Map(readNames(root, city).map((e) => [e.key, e]));
  const base = (key: string) => ({
    city,
    key,
    nearby: nearby[key] ?? [],
    done: done.get(key) ?? null,
  });
  const items: NameItem[] = [];

  for (const r of readCsv(join(review, 'unnamed.csv'))) {
    items.push({
      ...base(r.OSM ?? ''),
      kind: 'unnamed',
      lat: Number(r['緯度']),
      lng: Number(r['經度']),
      district: r['行政區'] ?? '',
      context: '',
      osmUrl: osmUrl(r.OSM ?? ''),
    });
  }

  const near = readCsv(join(review, 'osm-near-official.csv'));
  if (near.length > 0) {
    const osm = JSON.parse(readFileSync(join(root, 'data/raw', city, 'osm.json'), 'utf8')) as {
      playgrounds: { ref: string; lat: number; lng: number }[];
    };
    const at = new Map(osm.playgrounds.map((p) => [p.ref, p]));
    for (const r of near) {
      const p = at.get(r.OSM ?? '');
      if (!p) continue;
      items.push({
        ...base(r.OSM ?? ''),
        kind: 'near-official',
        lat: p.lat,
        lng: p.lng,
        district: '',
        context: `離官方場地「${r['官方場地']}」${r['距離']}；所在公園：${r['所在公園'] || '（無）'}`,
        osmUrl: osmUrl(r.OSM ?? ''),
      });
    }
  }

  for (const r of readCsv(join(review, 'named-suspicious.csv'))) {
    items.push({
      ...base(r.OSM ?? ''),
      kind: 'suspicious',
      lat: Number(r['緯度']),
      lng: Number(r['經度']),
      district: r['行政區'] ?? '',
      context: `OSM 上的名稱是「${r['OSM 名稱']}」，看起來不像公共遊戲場：是的話照名稱命名，不是就排除`,
      osmUrl: osmUrl(r.OSM ?? ''),
    });
  }

  for (const r of readCsv(join(review, 'odd-names.csv'))) {
    items.push({
      ...base(r['編號'] ?? ''),
      kind: 'odd-name',
      lat: Number(r['緯度']),
      lng: Number(r['經度']),
      district: r['行政區'] ?? '',
      context: `原本的名稱是用地編號「${r['名稱']}」`,
      osmUrl: null,
    });
  }
  return items;
}

export function loadAll(root: string) {
  return CITIES.map((c) => ({ city: c, items: loadItems(root, c.code) })).filter(
    (x) => x.items.length > 0,
  );
}

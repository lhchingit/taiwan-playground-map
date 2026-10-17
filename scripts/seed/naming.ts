// 會員命名的待命名清單（decisions D23）：data/review/<縣市>/unnamed.csv＋data/raw/<縣市>/osm-nearby.json
// → naming_candidates。只收 OSM 沒有名稱的遊戲場；桃園「離官方場地很近」、臺北用地編號仍用本機工具。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../tools/name/items';
import { EXCLUDE, type NameEntry } from '../tools/name/names-file';

export interface NamingCandidate {
  id: string;
  city: string;
  osm_ref: string;
  district: string | null;
  lat: number;
  lng: number;
  nearby: { name: string; kind: string; osm: string; distance_m: number }[];
}

/** 一個縣市的待命名清單；沒有 unnamed.csv 時是空陣列 */
export function loadNamingCandidates(city: string, root = '.'): NamingCandidate[] {
  const csv = join(root, 'data/review', city, 'unnamed.csv');
  if (!existsSync(csv)) return [];
  const hintsPath = join(root, 'data/raw', city, 'osm-nearby.json');
  const hints = existsSync(hintsPath)
    ? (
        JSON.parse(readFileSync(hintsPath, 'utf8')) as {
          nearby: Record<string, NamingCandidate['nearby']>;
        }
      ).nearby
    : {};
  return parseCsv(readFileSync(csv, 'utf8')).map((r) => {
    const ref = r.OSM ?? '';
    const lat = Number(r['緯度']);
    const lng = Number(r['經度']);
    if (!/^[nwr]\d+$/.test(ref) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`${csv}：看不懂的一列 ${JSON.stringify(r)}`);
    }
    return {
      id: `${city}-osm-${ref}`,
      city,
      osm_ref: ref,
      district: r['行政區'] || null,
      lat,
      lng,
      nearby: hints[ref] ?? [],
    };
  });
}

/** 資料庫裡已經決定的待命名點（會員達到門檻一致或審核員） */
export interface NamingResult {
  osm_ref: string;
  status: 'named' | 'excluded';
  resolved_name: string | null;
  resolved_basis: string;
  resolved_by: 'votes' | 'moderator';
  /** 投票通過時一致的人數；0029 之前通過的是 null（當時門檻是 3） */
  resolved_votes: number | null;
  /** YYYY-MM-DD */
  resolved_on: string;
}

/**
 * 會員命名的結果 → manual-names.tsv 的列（pnpm naming:export）。已經有的鍵不動（人工命名優先）。
 * 確認者只寫「會員 N 人一致」或「審核員」，不寫暱稱或 email。
 */
export function mergeNamingResults(
  existing: readonly NameEntry[],
  results: readonly NamingResult[],
): { entries: NameEntry[]; added: NameEntry[] } {
  const have = new Set(existing.map((e) => e.key));
  const added = results
    .filter((r) => !have.has(r.osm_ref))
    .map((r) => ({
      key: r.osm_ref,
      name: r.status === 'named' ? (r.resolved_name ?? '') : EXCLUDE,
      basis: r.resolved_basis,
      by: r.resolved_by === 'votes' ? `會員 ${r.resolved_votes ?? 3} 人一致` : '審核員',
      date: r.resolved_on,
    }));
  return { entries: [...existing, ...added], added };
}

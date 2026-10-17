// pnpm regen:filter-cases：用原型（docs/prototype/playmap.html）重新算 tests/fixtures/filter-cases.json 的標準答案。
//   pnpm regen:filter-cases           重新產生並寫入
//   pnpm regen:filter-cases --check   只檢查是否已經是最新（CI 用），不寫入
//
// 做法：在瀏覽器打開原型，把原型的場地換成 data/seed/hsc/places.json，用原型自己的 hav()、pass() 與排序算每個案例。
// 同時用正式版的 filterPlaces() 算一次。兩邊不同的案例只有在已經標註 deviation（核准過的偏差，例如 null 欄位的三態規則）
// 時才允許，而且採用正式版的結果；其他不同一律失敗，代表實作跟原型分歧了。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  DEFAULT_FILTERS,
  filterPlaces,
  type FilterPlace,
  type Filters,
  type GroupKeys,
} from '../src/lib/filter';
import { GROUP_IDS, groupKeyMap } from '../src/lib/play-groups';
import type { Place, SeedFile, Tri } from '../src/types/place';

const FIXTURE = 'tests/fixtures/filter-cases.json';
const SEED = 'data/seed/hsc/places.json';
const PROTOTYPE = pathToFileURL(resolve('docs/prototype/playmap.html')).href;

interface Case {
  name: string;
  filters: Partial<Omit<Filters, 'includeUnknown'>> & { unk?: boolean };
  expected_ids: string[];
  expected_count: number;
  unknown_hint: number;
  /** 核准過的偏差：原型與正式版的結果不同時，採用正式版的規則 */
  deviation?: string;
  note?: string;
}
interface Fixture {
  origin: { lat: number; lng: number; name: string };
  cases: Case[];
  [k: string]: unknown;
}
interface Answer {
  ids: string[];
  hint: number;
}

function toFilterPlace(p: Place): FilterPlace {
  const attrs: Record<string, Tri> = {};
  for (const [k, a] of Object.entries(p.attrs)) attrs[k] = a.v;
  return { ...p, attrs };
}

async function prototypeAnswers(places: Place[], fx: Fixture): Promise<Answer[]> {
  const groupNames: Record<string, string> = Object.fromEntries(
    Object.entries(GROUP_IDS).map(([name, id]) => [id, name]),
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // 原型會從網路載入地圖元件與圖磚；全部擋掉，原型照樣能算篩選結果
    await page.route(/^https?:/, (r) => r.abort());
    await page.goto(PROTOTYPE);
    return await page.evaluate(
      ({ places, cases, origin, groupNames }) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const w = globalThis as any;
        // 原型的全域變數：P（場地陣列）、st（篩選狀態）、hav()、pass()
        const P = w.eval('P') as any[];
        const st = w.eval('st');
        const hav = w.eval('hav');
        const pass = w.eval('pass');
        P.length = 0;
        P.push(...places);
        return cases.map(({ filters: f }: any) => {
          Object.assign(st, {
            origin,
            maxKm: f.maxKm ?? null,
            age: f.age ?? null,
            play: new Set(f.play ?? []),
            // 原型用類別名稱；fixture 用代號（decisions D26）
            grp: new Set((f.groups ?? []).map((id: string) => groupNames[id])),
            amen: new Set(f.amen ?? []),
            stay: new Set(f.stay ?? []),
            size: new Set(f.size ?? []),
            env: f.env ?? 'all',
            free: f.free ?? false,
            pkType: new Set(f.pkType ?? []),
            pkFee: f.pkFee ?? 'any',
            pkMin: f.pkMin ?? null,
            unk: f.unk ?? false,
          });
          // 跟原型 render() 相同的算法
          P.forEach((p) => (p._km = hav(st.origin, p)));
          const hit = P.filter((p) => pass(p, st.unk)).sort((a, b) => a._km - b._km);
          const withUnk = P.filter((p) => pass(p, true)).length;
          return {
            ids: hit.map((p) => p.id as string),
            hint: !st.unk && withUnk > hit.length ? withUnk - hit.length : 0,
          };
        });
      },
      { places, cases: fx.cases, origin: fx.origin, groupNames },
    );
  } finally {
    await browser.close();
  }
}

function productionAnswer(
  places: FilterPlace[],
  c: Case,
  origin: Fixture['origin'],
  groupKeys: GroupKeys,
): Answer {
  const { unk, ...rest } = c.filters;
  const r = filterPlaces(
    places,
    { ...DEFAULT_FILTERS, ...rest, includeUnknown: unk ?? false },
    origin,
    groupKeys,
  );
  return { ids: r.results.map((p) => p.id), hint: r.unknownHint };
}

const same = (a: Answer, b: Answer) =>
  a.hint === b.hint && a.ids.length === b.ids.length && a.ids.every((id, i) => id === b.ids[i]);

async function main() {
  const check = process.argv.includes('--check');
  const raw = readFileSync(FIXTURE, 'utf8');
  const fx = JSON.parse(raw) as Fixture;
  const seed = JSON.parse(readFileSync(SEED, 'utf8')) as SeedFile;

  const proto = await prototypeAnswers(seed.places, fx);
  const prod = seed.places.map(toFilterPlace);
  const groupKeys = groupKeyMap(seed.labels.play_groups);

  const problems: string[] = [];
  fx.cases.forEach((c, i) => {
    const p = proto[i]!;
    const q = productionAnswer(prod, c, fx.origin, groupKeys);
    let answer = p;
    if (!same(p, q)) {
      if (!c.deviation) {
        problems.push(
          `「${c.name}」原型 ${p.ids.length} 處（提示 ${p.hint}）、正式版 ${q.ids.length} 處（提示 ${q.hint}），而且沒有標註 deviation`,
        );
        return;
      }
      answer = q; // 核准過的偏差：採用正式版的規則
    }
    c.expected_ids = answer.ids;
    c.expected_count = answer.ids.length;
    c.unknown_hint = answer.hint;
  });
  if (problems.length > 0) {
    throw new Error(`原型與正式版的篩選結果不同：\n- ${problems.join('\n- ')}`);
  }

  const out = JSON.stringify(fx, null, 1);
  if (check) {
    if (out !== raw) throw new Error(`${FIXTURE} 不是最新的，請執行 pnpm regen:filter-cases`);
    console.log(`${FIXTURE} 是最新的（${fx.cases.length} 個案例）`);
    return;
  }
  writeFileSync(FIXTURE, out);
  for (const c of fx.cases) {
    console.log(
      `  ${c.name.padEnd(16, '　')} ${String(c.expected_count).padStart(3)} 處  提示 ${c.unknown_hint}`,
    );
  }
  console.log(out === raw ? '沒有變動。' : `已更新 ${FIXTURE}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

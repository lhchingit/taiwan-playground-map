// 匯入前檢查 places.json，違反 CLAUDE.md 資料規則就不匯入。
import type { SeedFile } from '../../src/types/place';

const TRI = new Set(['y', 'n', 'u']);
const PARKING_TYPE = new Set(['lot', 'street', 'none', 'u']);
const PARKING_FEE = new Set(['free', 'paid', 'u']);
const SOURCE_KIND = new Set(['open_data', 'article', 'news', 'lead', 'estimate', 'user', 'survey']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// 台灣本島與離島的大致範圍，用來抓經緯度寫反或打錯
const TW = { latMin: 21.5, latMax: 26.5, lngMin: 118, lngMax: 122.5 };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 回傳錯誤訊息清單；空陣列代表通過 */
export function validateSeed(data: unknown): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  if (!isObj(data)) return ['places.json 不是物件'];
  const { sources, labels, places } = data;
  if (!isObj(sources)) return ['缺少 sources'];
  if (
    !isObj(labels) ||
    !isObj(labels.play) ||
    !isObj(labels.amenity) ||
    !Array.isArray(labels.play_groups)
  )
    return ['labels 需要 play、play_groups、amenity'];
  if (!Array.isArray(places)) return ['缺少 places'];

  for (const [id, s] of Object.entries(sources)) {
    if (!isObj(s) || typeof s.label !== 'string' || !SOURCE_KIND.has(s.kind as string))
      err(`來源 ${id}：label 或 kind 不正確`);
  }

  // play_groups 必須剛好涵蓋 labels.play 的每個 key 一次
  const grouped: string[] = labels.play_groups.flatMap((g: unknown) =>
    isObj(g) && Array.isArray(g.keys) ? (g.keys as string[]) : [],
  );
  const playKeys = Object.keys(labels.play);
  if (grouped.length !== new Set(grouped).size) err('play_groups 有重複的 key');
  for (const k of playKeys) if (!grouped.includes(k)) err(`遊樂設施 ${k} 沒有分組`);
  for (const k of grouped) if (!(k in labels.play)) err(`play_groups 的 ${k} 不在 labels.play`);
  const keys = new Set([...playKeys, ...Object.keys(labels.amenity)]);

  const needsSource = (where: string, src: unknown, at: unknown) => {
    if (typeof src !== 'string' || !(src in sources))
      err(`${where}：缺少來源或來源不存在（${String(src)}）`);
    if (typeof at !== 'string' || !DATE.test(at)) err(`${where}：缺少確認日期`);
  };

  const ids = new Set<string>();
  for (const p of places as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string') {
      err('有場地缺少 id');
      continue;
    }
    const id = p.id;
    if (ids.has(id)) err(`${id}：id 重複`);
    ids.add(id);
    if (id.startsWith('test-')) err(`${id}：測試資料不可進入 seed`);
    if (typeof p.city !== 'string' || !/^[a-z]{3}$/.test(p.city))
      err(`${id}：city 必須是三碼縣市代碼`);
    else if (!id.startsWith(`${p.city}-`)) err(`${id}：id 開頭必須是縣市代碼 ${p.city}-`);
    if (typeof p.name !== 'string' || !p.name) err(`${id}：缺少名稱`);

    const { lat, lng } = p;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      lat < TW.latMin ||
      lat > TW.latMax ||
      lng < TW.lngMin ||
      lng > TW.lngMax
    )
      err(`${id}：座標不在台灣範圍內`);
    if (
      p.area_ha !== undefined &&
      p.area_ha !== null &&
      !(typeof p.area_ha === 'number' && p.area_ha >= 0)
    )
      err(`${id}：area_ha 必須是非負數或 null`);
    if (typeof p.source_coords === 'string' && p.source_coords.includes('Google'))
      err(`${id}：座標來自 Google，不可存進資料庫`);

    if (!isObj(p.attrs)) {
      err(`${id}：缺少 attrs`);
    } else {
      for (const [k, a] of Object.entries(p.attrs)) {
        const where = `${id}.${k}`;
        if (!keys.has(k)) err(`${where}：未定義的屬性`);
        if (!isObj(a) || !TRI.has(a.v as string)) {
          err(`${where}：值必須是 y / n / u`);
          continue;
        }
        // y / n 是事實，一定要有來源；u 有來源時來源也必須存在
        if (a.v !== 'u' || a.src !== null) needsSource(where, a.src, a.at);
      }
    }

    const pk = p.parking;
    if (!isObj(pk)) {
      err(`${id}：缺少 parking`);
    } else {
      const where = `${id}.parking`;
      if (!PARKING_TYPE.has(pk.type as string)) err(`${where}：type 不正確`);
      if (!PARKING_FEE.has(pk.fee as string)) err(`${where}：fee 不正確`);
      if (pk.spaces !== null && !(Number.isInteger(pk.spaces) && (pk.spaces as number) >= 0))
        err(`${where}：spaces 必須是非負整數或 null`);
      const known = pk.type !== 'u' || pk.fee !== 'u' || pk.spaces !== null;
      if (known || pk.src !== null) needsSource(where, pk.src, pk.at);
    }
  }
  return errors;
}

export function assertValidSeed(data: unknown): asserts data is SeedFile {
  const errors = validateSeed(data);
  if (errors.length > 0) {
    throw new Error(`places.json 有 ${errors.length} 個問題：\n- ${errors.join('\n- ')}`);
  }
}

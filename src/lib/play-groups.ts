// 遊樂設施類別的顏色與圖示（decisions D24）：篩選、清單標籤、場地頁共用。純函式，有單元測試。
// 類別來自 attribute_defs.group_name；不認得的類別（新增時忘了加）用預設色，畫面不會壞。

/** 色調：CSS 用 [data-tone] 對應到 globals.css 的顏色 */
export type Tone = 'slide' | 'sky' | 'sun' | 'grass' | 'grape' | 'leaf';

export const GROUP_TONES: Readonly<Record<string, Tone>> = {
  滑行擺盪: 'slide',
  攀爬平衡: 'sky',
  玩沙玩水: 'sun',
  跑跳體能: 'grass',
  感官創意: 'grape',
};
/** 生活機能（廁所、飲水機等）沒有類別名稱 */
export const AMENITY_TONE: Tone = 'leaf';

/** 類別名稱 → 色調；null 是生活機能；不認得的類別回傳 undefined（用預設色） */
export function groupTone(name: string | null): Tone | undefined {
  return name === null ? AMENITY_TONE : GROUP_TONES[name];
}

/** 每個屬性的色調（清單卡片的標籤用） */
export function keyTones(catalog: {
  playGroups: readonly { name: string; keys: readonly string[] }[];
  amenity: readonly string[];
}): Record<string, Tone | undefined> {
  const out: Record<string, Tone | undefined> = {};
  for (const g of catalog.playGroups) for (const k of g.keys) out[k] = groupTone(g.name);
  for (const k of catalog.amenity) out[k] = AMENITY_TONE;
  return out;
}

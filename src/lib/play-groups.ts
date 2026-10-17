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
/**
 * 類別代號（decisions D26）：網址的 grp 參數用，例如 ?grp=climb。
 * 沒有代號的類別不能整類選取（類別名稱不做成按鈕），畫面照常。
 */
export const GROUP_IDS: Readonly<Record<string, string>> = {
  滑行擺盪: 'ride',
  攀爬平衡: 'climb',
  玩沙玩水: 'sandwater',
  跑跳體能: 'active',
  感官創意: 'sense',
};

/** 類別名稱 → 代號；沒有代號回傳 undefined */
export function groupId(name: string): string | undefined {
  return GROUP_IDS[name];
}

/** 類別代號 → 這一類的屬性 key（篩選「其中任一種」用） */
export function groupKeyMap(
  playGroups: readonly { name: string; keys: readonly string[] }[],
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const g of playGroups) {
    const id = groupId(g.name);
    if (id) out[id] = g.keys;
  }
  return out;
}

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

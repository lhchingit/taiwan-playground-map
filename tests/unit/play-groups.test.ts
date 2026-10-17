import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AMENITY_TONE, GROUP_TONES, groupTone, keyTones } from '@/lib/play-groups';

describe('遊樂設施類別的顏色（decisions D24）', () => {
  it('五個類別各有不同的色調；生活機能另外一種', () => {
    expect(groupTone('滑行擺盪')).toBe('slide');
    expect(groupTone('攀爬平衡')).toBe('sky');
    expect(groupTone('玩沙玩水')).toBe('sun');
    expect(groupTone('跑跳體能')).toBe('grass');
    expect(groupTone('感官創意')).toBe('grape');
    expect(groupTone(null)).toBe(AMENITY_TONE);
    const tones = Object.values(GROUP_TONES);
    expect(new Set([...tones, AMENITY_TONE]).size).toBe(tones.length + 1);
  });

  it('不認得的類別回傳 undefined（畫面用預設色）', () => {
    expect(groupTone('新的類別')).toBeUndefined();
  });

  it('每個屬性對到所屬類別的色調', () => {
    const tones = keyTones({
      playGroups: [
        { name: '滑行擺盪', keys: ['slide', 'swing'] },
        { name: '新的類別', keys: ['x'] },
      ],
      amenity: ['toilet'],
    });
    expect(tones).toEqual({ slide: 'slide', swing: 'slide', x: undefined, toilet: 'leaf' });
  });

  it('每個色調在 globals.css 都有對應的 [data-tone] 規則', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    for (const tone of new Set([...Object.values(GROUP_TONES), AMENITY_TONE])) {
      expect(css).toContain(`[data-tone='${tone}'] {`);
    }
  });
});

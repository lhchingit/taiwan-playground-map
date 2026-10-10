import { describe, expect, it } from 'vitest';
import { readAttr, type SeedFile } from '@/types/place';
import fixture from '../fixtures/seed-test.json';
import { toAttributeDefs, toSeedRows } from '../../scripts/seed/transform';

const seed = fixture as SeedFile;

describe('toSeedRows', () => {
  const rows = toSeedRows(seed);

  it('未知且沒有來源的屬性不寫入；y、n、有來源的 u 都寫入', () => {
    expect(rows.placeAttributes.map((a) => `${a.place_id}.${a.key}=${a.value}`)).toEqual([
      'test-hsq-known.slide=y',
      'test-hsq-known.toilet=n',
      'test-hsq-known.shade=u',
    ]);
  });

  it('寫入的屬性保留來源與確認日期', () => {
    expect(rows.placeAttributes[0]).toEqual({
      place_id: 'test-hsq-known',
      key: 'slide',
      value: 'y',
      note: '測試',
      source_id: 'est',
      verified_at: '2026-10-10',
    });
  });

  it('停車每個場地一列，未知也要有一列 type = u', () => {
    expect(rows.parking).toHaveLength(2);
    expect(rows.parking[1]).toMatchObject({
      place_id: 'test-hsq-unknown',
      type: 'u',
      fee: 'u',
      spaces: null,
    });
  });

  it('場地欄位改成資料表欄位名稱，未知維持 null', () => {
    expect(rows.places[1]).toMatchObject({
      id: 'test-hsq-unknown',
      city: 'hsq',
      size_class: null,
      stay_bucket: null,
      age_min: null,
      address: null,
      hours: null,
    });
  });

  it('依縣市產生範圍', () => {
    expect(rows.cities.map((c) => c.code)).toEqual(['hsq']);
  });
});

describe('toAttributeDefs', () => {
  it('保留遊樂設施分組與順序，生活機能沒有分組', () => {
    expect(toAttributeDefs(seed.labels)).toEqual([
      { key: 'slide', label: '溜滑梯', category: 'play', group_name: '滑行擺盪', sort_order: 1 },
      { key: 'sandpit', label: '沙坑', category: 'play', group_name: '玩沙玩水', sort_order: 2 },
      { key: 'toilet', label: '廁所', category: 'amenity', group_name: null, sort_order: 1 },
      { key: 'shade', label: '遮蔭', category: 'amenity', group_name: null, sort_order: 2 },
    ]);
  });
});

describe('readAttr', () => {
  it('attrs 沒有的 key 一律當成未知', () => {
    const attrs = { slide: 'y', toilet: 'n' };
    expect(readAttr(attrs, 'slide')).toBe('y');
    expect(readAttr(attrs, 'toilet')).toBe('n');
    expect(readAttr(attrs, 'skatepark')).toBe('u');
    expect(readAttr(null, 'slide')).toBe('u');
    expect(readAttr({ slide: 'true' }, 'slide')).toBe('u');
  });
});

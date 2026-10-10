// 種子資料：每個縣市一個資料夾 data/seed/<縣市>/places.json
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedFile } from '../../src/types/place';
import { validateSeed } from './validate';

export const SEED_DIR = 'data/seed';

/** 有 places.json 的縣市代碼（依字母排序） */
export function listSeedCities(dir = SEED_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'places.json')))
    .map((d) => d.name)
    .sort();
}

export function readSeedFile(code: string, dir = SEED_DIR): unknown {
  return JSON.parse(readFileSync(join(dir, code, 'places.json'), 'utf8'));
}

/**
 * 跨檔檢查：每個檔案各自通過 validateSeed 之後，再確認彼此一致。
 * - 屬性字典（labels）每個縣市都要相同（attribute_defs 是全國共用的）
 * - 同一個來源 id 在不同檔案的內容要相同
 * - 場地的 city 要等於資料夾名稱
 */
export function crossCheck(files: readonly (readonly [string, SeedFile])[]): string[] {
  const errors: string[] = [];
  const [first] = files;
  for (const [code, seed] of files) {
    for (const p of seed.places) {
      if (p.city !== code)
        errors.push(`${code}/places.json：${p.id} 的 city 是 ${p.city}，跟資料夾不符`);
    }
    if (
      first &&
      code !== first[0] &&
      JSON.stringify(seed.labels) !== JSON.stringify(first[1].labels)
    ) {
      errors.push(
        `${code}/places.json 的屬性字典（labels）跟 ${first[0]} 不同；新增屬性要所有縣市一起改`,
      );
    }
  }
  const seen = new Map<string, [string, string]>();
  for (const [code, seed] of files) {
    for (const [id, s] of Object.entries(seed.sources)) {
      const json = JSON.stringify(s);
      const prev = seen.get(id);
      if (!prev) seen.set(id, [code, json]);
      else if (prev[1] !== json) errors.push(`來源 ${id} 在 ${prev[0]} 與 ${code} 的內容不同`);
    }
  }
  return errors;
}

/** 讀取並檢查全部縣市的檔案；有任何問題就丟錯，不匯入 */
export function loadAllSeeds(dir = SEED_DIR): [string, SeedFile][] {
  const errors: string[] = [];
  const files: [string, SeedFile][] = [];
  for (const code of listSeedCities(dir)) {
    const data = readSeedFile(code, dir);
    const e = validateSeed(data);
    if (e.length > 0) errors.push(...e.map((m) => `${code}：${m}`));
    else files.push([code, data as SeedFile]);
  }
  if (errors.length === 0) errors.push(...crossCheck(files));
  if (errors.length > 0) {
    throw new Error(`種子資料有 ${errors.length} 個問題：\n- ${errors.join('\n- ')}`);
  }
  return files;
}

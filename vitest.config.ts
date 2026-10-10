import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      // 純函式，不需要資料庫
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      // 需要本機 Supabase（supabase start → supabase db reset → pnpm seed）
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          fileParallelism: false, // 測試會暫時改動共用的資料庫狀態
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});

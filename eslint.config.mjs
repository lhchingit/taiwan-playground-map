import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    '.next/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'src/types/database.ts', // supabase gen types 產生
    'docs/**', // 原型，不在這裡檢查
  ]),
]);

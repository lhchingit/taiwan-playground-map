// scripts/vercel-ignore.mjs 的型別（tsconfig 沒開 allowJs，給單元測試用）
export function isSiteIrrelevant(file: string): boolean;
export function shouldSkip(env: { VERCEL_ENV?: string }, changedFiles: string[] | null): boolean;

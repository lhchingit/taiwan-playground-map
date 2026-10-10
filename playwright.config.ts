import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// 前提：本機 Supabase 已 db reset + seed，並執行過 pnpm env:local（webServer 會讀 .env.local）
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/hsinchu-city`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});

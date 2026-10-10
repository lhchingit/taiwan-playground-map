import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// 設定 PLAYWRIGHT_BASE_URL 時改測已經在跑的網站（例：Docker 容器 http://localhost:3000），不自己啟動伺服器
const external = process.env.PLAYWRIGHT_BASE_URL;

// 前提：本機 Supabase 已 db reset + seed，並執行過 pnpm env:local（webServer 會讀 .env.local）
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: external ?? `http://localhost:${PORT}` },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}/hsinchu-city`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});

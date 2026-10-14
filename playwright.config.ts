import { defineConfig, devices } from '@playwright/test';
import { E2E_REVALIDATE_SECRET } from './tests/e2e/constants';

const PORT = 3100;
// 設定 PLAYWRIGHT_BASE_URL 時改測已經在跑的網站（例：Docker 容器 http://localhost:3000），不自己啟動伺服器
const external = process.env.PLAYWRIGHT_BASE_URL;

// 前提：本機 Supabase 已 db reset + seed，並執行過 pnpm env:local（webServer 會讀 .env.local）
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: external ?? `http://localhost:${PORT}` },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /multi-city|admin|naming\.spec/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /multi-city|admin|naming\.spec/ },
    // 會暫時讓新竹縣上線，所以等其他測試跑完才執行
    {
      name: 'multi-city',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /multi-city/,
      dependencies: ['desktop', 'mobile'],
    },
    // 審核會改動真實場地（綠光公園）的資料、會員命名會在新竹市建立場地，等其他測試都跑完才執行，跑完還原
    {
      name: 'moderation',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /admin\.spec|naming\.spec/,
      dependencies: ['multi-city'],
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}/hsinchu-city`,
        reuseExistingServer: !process.env.CI,
        env: { REVALIDATE_SECRET: E2E_REVALIDATE_SECRET },
        timeout: 300_000,
      },
});

// 資料庫改變後（匯入、上線、下線）通知網站清除快取，讓變更立刻生效。
// 需要 SITE_URL 與 REVALIDATE_SECRET；沒設定時網站最多 1 小時後才會更新。
// 清快取失敗只警告、不中斷：資料庫已經更新，網站最晚 1 小時後也會更新。
import { existsSync, readFileSync } from 'node:fs';

/** 解析簡單的 KEY=VALUE 檔（.env.local），忽略註解與空行 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m?.[1] && !line.trimStart().startsWith('#')) out[m[1]] = m[2] ?? '';
  }
  return out;
}

export interface SiteConfig {
  site: string;
  secret: string;
}

/**
 * 決定要通知哪個網站：環境變數優先；操作本機資料庫時，沒設定的值才從 .env.local 補
 * （pnpm env:local 產生，指向本機的開發伺服器或 Docker 容器）。
 * 連正式資料庫（--allow-remote）時不讀 .env.local，避免把正式環境的變更通知到本機網站。
 */
export function siteConfig(
  env: { SITE_URL?: string; REVALIDATE_SECRET?: string },
  localDb: boolean,
  localFile: Record<string, string> = {},
): SiteConfig | null {
  const site = env.SITE_URL || (localDb ? localFile.SITE_URL : undefined);
  const secret = env.REVALIDATE_SECRET || (localDb ? localFile.REVALIDATE_SECRET : undefined);
  return site && secret ? { site: site.replace(/\/$/, ''), secret } : null;
}

function readLocalEnv(): Record<string, string> {
  return existsSync('.env.local') ? parseEnvFile(readFileSync('.env.local', 'utf8')) : {};
}

function warn(message: string) {
  // GitHub Actions 會把這行顯示成黃色警告
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `注意：${message}`);
}

/** 回傳是否成功清除快取 */
export async function revalidateSite(city: string | null, localDb: boolean): Promise<boolean> {
  const env = { SITE_URL: process.env.SITE_URL, REVALIDATE_SECRET: process.env.REVALIDATE_SECRET };
  const config = siteConfig(env, localDb, localDb ? readLocalEnv() : {});
  if (!config) {
    console.log('沒有設定 SITE_URL／REVALIDATE_SECRET：網站的快取最多 1 小時後更新。');
    return false;
  }
  try {
    const res = await fetch(`${config.site}/api/revalidate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(city ? { city } : {}),
    });
    if (!res.ok) {
      warn(
        `清快取失敗（${config.site}，HTTP ${res.status}）：資料庫已更新，網站最多 1 小時後更新。`,
      );
      return false;
    }
  } catch {
    warn(`連不到網站（${config.site}）：資料庫已更新；網站沒在執行就不需要清快取。`);
    return false;
  }
  console.log(`已清除網站快取（${config.site}），變更立刻生效。`);
  return true;
}

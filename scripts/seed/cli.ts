// pnpm seed／pnpm city 的參數解析與資料庫連線（純函式的部分有單元測試）
import postgres from 'postgres';

export const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const CITY_CODE = /^[a-z]{3}$/;

export interface SeedArgs {
  /** 只匯入這個縣市；沒指定時匯入全部 */
  city: string | null;
  /** 試跑：在交易裡做完全部步驟後回滾，不寫入 */
  dryRun: boolean;
  allowRemote: boolean;
}

export function parseSeedArgs(argv: readonly string[]): SeedArgs {
  const out: SeedArgs = { city: null, dryRun: false, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-remote') out.allowRemote = true;
    else if (a === '--city') {
      const code = argv[++i];
      if (!code || !CITY_CODE.test(code))
        throw new Error('--city 後面要接三碼縣市代碼，例如 --city hsq');
      out.city = code;
    } else throw new Error(`不認得的參數：${a}`);
  }
  return out;
}

export type CityAction = 'status' | 'launch' | 'unlaunch';

export interface CityArgs {
  action: CityAction;
  /** status 可以不指定 */
  code: string | null;
  allowRemote: boolean;
}

export function parseCityArgs(argv: readonly string[]): CityArgs {
  const allowRemote = argv.includes('--allow-remote');
  const rest = argv.filter((a) => a !== '--allow-remote');
  const [action, code, ...extra] = rest;
  if (action !== 'status' && action !== 'launch' && action !== 'unlaunch') {
    throw new Error('用法：pnpm city status|launch|unlaunch <縣市代碼> [--allow-remote]');
  }
  if (extra.length > 0) throw new Error(`多了參數：${extra.join(' ')}`);
  if (code !== undefined && !CITY_CODE.test(code))
    throw new Error(`縣市代碼要是三碼小寫英文：${code}`);
  if (action !== 'status' && !code)
    throw new Error(`${action} 要指定縣市代碼，例如 pnpm city ${action} hsq`);
  return { action, code: code ?? null, allowRemote };
}

export function isLocalDatabase(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/** 預設只連本機；連其他主機一定要明確加上 --allow-remote，避免誤寫正式資料庫 */
export function resolveDatabaseUrl(databaseUrl: string | undefined, allowRemote: boolean): string {
  const url = databaseUrl ?? LOCAL_DB;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    throw new Error(
      `DATABASE_URL 指向 ${host}，不是本機；確定要操作這個資料庫的話加上 --allow-remote`,
    );
  }
  return url;
}

export function connect(url: string) {
  return postgres(url, { onnotice: () => {} });
}

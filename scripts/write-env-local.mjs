// pnpm env:local：從本機 Supabase（supabase status）產生 .env.local，給 Next.js 開發、Docker 與 e2e 使用。
// 本機 Supabase 的金鑰是固定的範例金鑰，.env.local 已在 .gitignore。
// 也產生本機用的清快取密鑰（REVALIDATE_SECRET）：pnpm seed／pnpm city 改資料後，
// 會用它通知本機網站（pnpm dev 或 Docker 容器）立刻更新。已經有的密鑰會沿用，避免跟執行中的容器不一致。
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

let status;
try {
  status = JSON.parse(execSync('pnpm exec supabase status -o json', { encoding: 'utf8' }));
} catch {
  console.error('讀不到本機 Supabase，請先執行 pnpm exec supabase start');
  process.exit(1);
}

const previous = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const keep = (key) => previous.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1];

const lines = [
  '# 由 pnpm env:local 產生（scripts/write-env-local.mjs），不要手動修改',
  `SUPABASE_URL=${status.API_URL}`,
  `SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  '# 本機網站的網址與清快取密鑰（只在本機使用）',
  `SITE_URL=${keep('SITE_URL') ?? 'http://localhost:3000'}`,
  `REVALIDATE_SECRET=${keep('REVALIDATE_SECRET') ?? randomBytes(24).toString('hex')}`,
  '# Cloudflare Turnstile：預設是官方的測試金鑰（一定通過，只能在本機與 CI 使用）',
  `TURNSTILE_SITE_KEY=${keep('TURNSTILE_SITE_KEY') ?? '1x00000000000000000000AA'}`,
  `TURNSTILE_SECRET_KEY=${keep('TURNSTILE_SECRET_KEY') ?? '1x0000000000000000000000000000000AA'}`,
  // 選填：Google 官方登入按鈕（decisions D28）。手動加上的值保留
  ...(keep('GOOGLE_CLIENT_ID') ? [`GOOGLE_CLIENT_ID=${keep('GOOGLE_CLIENT_ID')}`] : []),
  '',
];
writeFileSync('.env.local', lines.join('\n'));
console.log(`已寫入 .env.local（SUPABASE_URL=${status.API_URL}）`);

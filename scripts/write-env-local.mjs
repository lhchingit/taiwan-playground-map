// pnpm env:local：從本機 Supabase（supabase status）產生 .env.local，給 Next.js 開發與 e2e 使用。
// 本機 Supabase 的金鑰是固定的範例金鑰，.env.local 已在 .gitignore。
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let status;
try {
  status = JSON.parse(execSync('pnpm exec supabase status -o json', { encoding: 'utf8' }));
} catch {
  console.error('讀不到本機 Supabase，請先執行 pnpm exec supabase start');
  process.exit(1);
}

const lines = [
  '# 由 pnpm env:local 產生（scripts/write-env-local.mjs），不要手動修改',
  `SUPABASE_URL=${status.API_URL}`,
  `SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  '',
];
writeFileSync('.env.local', lines.join('\n'));
console.log(`已寫入 .env.local（SUPABASE_URL=${status.API_URL}）`);

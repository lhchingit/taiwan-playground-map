// Vercel 的 Ignored Build Step（vercel.json 的 ignoreCommand）。結束碼 0 是跳過，1 是建置。
// 只改資料、腳本、測試或文件的合併不重新部署：網站不讀這些資料夾，
// 場地資料在資料庫，pnpm seed 匯入後會呼叫 /api/revalidate 更新頁面（decisions D32）。
// Vercel 執行時還沒安裝套件，所以只能用 Node 內建的模組。
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SKIP_DIRS = ['data/', 'docs/', 'scripts/', 'tests/', '.github/'];

/** 根目錄的 *.md 和 SKIP_DIRS 裡的檔案不影響網站。 */
export function isSiteIrrelevant(file) {
  return SKIP_DIRS.some((dir) => file.startsWith(dir)) || /^[^/]+\.md$/.test(file);
}

/**
 * 要不要跳過這次部署。
 * changedFiles 是 null 表示拿不到改動清單，這時照常建置。
 */
export function shouldSkip(env, changedFiles) {
  // vercel.json 的設定會蓋掉後台的「Only build production」，所以這裡也只建置正式環境
  if (env.VERCEL_ENV !== 'production') return true;
  if (!changedFiles || changedFiles.length === 0) return false;
  return changedFiles.every(isSiteIrrelevant);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function hasCommit(sha) {
  try {
    git('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** 上一次成功部署到現在改了哪些檔案；拿不到就回傳 null。 */
function changedSincePreviousDeploy(base) {
  if (!base) return null;
  try {
    // Vercel 的 clone 很淺，找不到上一次部署的 commit 就往前多抓一些
    if (!hasCommit(base)) git('fetch', '--quiet', '--deepen=100', 'origin');
    if (!hasCommit(base)) return null;
    return git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const files =
    env.VERCEL_ENV === 'production' ? changedSincePreviousDeploy(env.VERCEL_GIT_PREVIOUS_SHA) : [];
  const skip = shouldSkip(env, files);
  console.log(
    `VERCEL_ENV=${env.VERCEL_ENV ?? ''} 上一次部署=${env.VERCEL_GIT_PREVIOUS_SHA ?? '（沒有）'}`,
  );
  if (files === null) console.log('拿不到改動清單');
  else if (files.length)
    console.log(`改動的檔案（${files.length}）：\n  ${files.slice(0, 50).join('\n  ')}`);
  console.log(skip ? '跳過部署' : '照常建置');
  process.exit(skip ? 0 : 1);
}

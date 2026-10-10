// 資料庫改變後（匯入、上線、下線）通知網站清除快取，讓變更立刻生效。
// 需要 SITE_URL 與 REVALIDATE_SECRET；沒設定時網站最多 1 小時後才會更新。
export async function revalidateSite(city: string | null): Promise<void> {
  const site = process.env.SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!site || !secret) {
    console.log('沒有設定 SITE_URL／REVALIDATE_SECRET：網站的快取最多 1 小時後更新。');
    return;
  }
  const res = await fetch(`${site.replace(/\/$/, '')}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(city ? { city } : {}),
  });
  if (!res.ok) {
    throw new Error(`清快取失敗：HTTP ${res.status}（資料庫已更新，網站最多 1 小時後更新）`);
  }
  console.log(`已清除網站快取（${site}），變更立刻生效。`);
}

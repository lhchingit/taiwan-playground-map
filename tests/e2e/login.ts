// e2e 共用：用 Email 登入連結登入（信由本機 Supabase 的 Mailpit 收）
import { expect, type Page } from '@playwright/test';
import { MAILPIT_URL } from '../db/helpers';

/** 從 Mailpit 讀這個信箱最新的一封信，取出登入連結 */
export async function loginLink(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`,
    );
    const list = (await res.json()) as { messages: { ID: string }[] };
    const id = list.messages[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
        HTML: string;
      };
      const href = /href="([^"]+)"/.exec(msg.HTML)?.[1];
      if (href) return href.replaceAll('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Mailpit 沒有收到寄給 ${email} 的信`);
}

/** 在畫面上的登入表單（登入頁或登入視窗）用 Email 登入，打開信裡的連結 */
export async function loginWithEmail(page: Page, email: string) {
  await page.getByLabel('用 Email 登入連結（不需要密碼）').fill(email);
  await page.getByRole('button', { name: '寄登入連結' }).click();
  await expect(page.getByText(`登入連結已寄到 ${email}`)).toBeVisible();
  await page.goto(await loginLink(email));
}

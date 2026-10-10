import { expect, test } from '@playwright/test';

test('首頁可以開啟', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('main')).toContainText('竹市放電地圖');
});

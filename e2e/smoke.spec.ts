import { test, expect } from '@playwright/test';

test('workbench loads and shows title', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { name: 'SD Model Workbench' })).toBeVisible();
});

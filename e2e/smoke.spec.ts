import { test, expect } from '@playwright/test';

test('workbench loads and shows title', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByText(/System Dynamics Workbench/i)).toBeVisible();
  await page.getByRole('button', { name: /new scenario/i }).click();
  await page.getByRole('button', { name: /run scenarios/i }).click();
  await page.getByRole('tab', { name: /sensitivity/i }).click();
  await page.getByRole('button', { name: /run oat/i }).click();
  await page.getByRole('button', { name: /run monte carlo/i }).click();
});

import { test, expect } from '@playwright/test';

test.setTimeout(5000);

test('go to /', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector(`text=Events`);
});

test('see an event', async ({ page }) => {
  await page.goto('/');
  await page.click(`a`);
  await expect(
    page.getByRole('heading', { name: 'Summer fair' }),
  ).toBeVisible();
});

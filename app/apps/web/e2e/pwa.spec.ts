import { expect, test } from '@playwright/test';
import { openTable } from './game.js';

test('app opens offline', async ({ context, page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  // The worker is active only once it has cached the app shell.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const uncached = await page.evaluate(() =>
    fetch(`./uncached-${Date.now()}`).then(
      () => 'fetched',
      () => 'failed',
    ),
  );
  expect(uncached, 'requests that are not cached fail while offline').toBe('failed');

  await page.close();
  const table = await openTable(context);
  await expect(table.host.getByTestId('phase-bar')).toBeVisible();
  await expect(table.guest.getByTestId('phase-bar')).toBeVisible();
});

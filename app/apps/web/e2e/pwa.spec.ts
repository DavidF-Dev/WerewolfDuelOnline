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

test('Japanese text works offline after first use', async ({ context, page }) => {
  await page.goto('/#/settings');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // English and German players never download the Japanese fonts, so the worker does not precache them.
  const worker = await page.evaluate(() => fetch('./sw.js').then((response) => response.text()));
  expect(worker).toContain('index.html');
  expect(worker).not.toMatch(/biz-udpgothic|shippori/i);
  await page.getByLabel('Language').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('設定');
  // Choosing Japanese fetches all three faces, so that every screen has them later.
  const faces = () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      const loaded: string[] = [];
      document.fonts.forEach((face) => {
        if (face.status === 'loaded' && /BIZ|Shippori/.test(face.family)) {
          loaded.push(`${face.family.replaceAll('"', '')} ${face.weight}`);
        }
      });
      return loaded.sort();
    });
  await expect
    .poll(faces)
    .toEqual(['BIZ UDPGothic 400', 'BIZ UDPGothic 700', 'Shippori Mincho B1 700']);

  await context.setOffline(true);
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
  await expect(page.getByTestId('home-settings')).toHaveAccessibleName('設定');
  await expect
    .poll(faces)
    .toEqual(['BIZ UDPGothic 400', 'BIZ UDPGothic 700', 'Shippori Mincho B1 700']);
});

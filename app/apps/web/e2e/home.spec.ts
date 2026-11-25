import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openGalleryEntry } from './gallery-entries.js';

const BLOCKING: ReadonlySet<string> = new Set(['serious', 'critical']);

async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map((violation) => `${violation.id}: ${violation.help}`);
}

/** The menu's box against the window's, in CSS pixels. */
const menuBox = (page: Page) =>
  page.getByRole('menu').evaluate((menu) => {
    const box = menu.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
    };
  });

test('the more menu and remove dialog work from the keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the keyboard is the same in every project');
  await openGalleryEntry(page, 'home');
  const more = page.getByTestId('home-more').first();
  await expect(more).toHaveAccessibleName(/^More for the game with /);
  await more.focus();

  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  const item = menu.getByRole('menuitem', { name: 'Remove from this device' });
  await expect(item).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  expect(await blockingViolations(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Space');
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'Remove this game?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(await blockingViolations(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.getByTestId('home-session')).toHaveCount(2);
});

test('the more menu opens above its button when there is no room below', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
  await page.setViewportSize({ width: 360, height: 220 });
  await openGalleryEntry(page, 'home');
  const more = page.getByTestId('home-more').nth(1);
  await more.click();
  const menu = await menuBox(page);
  const button = (await more.boundingBox())!;
  expect(menu.bottom, 'the menu ends above the button').toBeLessThanOrEqual(button.y + 1);
  expect(menu.top, 'the menu starts in the window').toBeGreaterThanOrEqual(0);

  // The first row has room below, so its menu opens downwards as usual.
  await page.keyboard.press('Escape');
  const first = page.getByTestId('home-more').first();
  await first.click();
  const below = await menuBox(page);
  const firstButton = (await first.boundingBox())!;
  expect(below.top).toBeGreaterThanOrEqual(firstButton.y + firstButton.height - 1);
  expect(below.bottom).toBeLessThanOrEqual(below.height);
});

test('a long menu label wraps inside the window', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
  await page.setViewportSize({ width: 320, height: 740 });
  await openGalleryEntry(page, 'home');
  await page.getByTestId('home-more').first().click();
  await page.getByRole('menuitem').evaluate((item) => {
    item.textContent = 'Von diesem Gerät entfernen und nie wieder fortsetzen können';
  });
  const box = await menuBox(page);
  expect(box.left, 'left').toBeGreaterThanOrEqual(0);
  expect(box.right, 'right').toBeLessThanOrEqual(box.width);
  const scroll = await page.evaluate(() => document.scrollingElement!.scrollWidth);
  expect(scroll, 'no horizontal scroll').toBeLessThanOrEqual(box.width);
  const item = await page.getByRole('menuitem').evaluate((element) => ({
    overflow: element.scrollWidth - element.clientWidth,
    right: element.getBoundingClientRect().right,
  }));
  expect(item.overflow, 'the label wraps rather than overflowing').toBeLessThanOrEqual(0);
  expect(item.right, 'the item ends inside the menu').toBeLessThanOrEqual(box.right);
});

test.describe('the more menu stays in the window', () => {
  for (const width of [320, 360, 1280]) {
    test(`at ${width} px`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
      await page.setViewportSize({ width, height: 740 });
      await openGalleryEntry(page, 'home');
      for (const index of [0, 1]) {
        await page.getByTestId('home-more').nth(index).click();
        const box = await menuBox(page);
        expect(box.left, `row ${index + 1}: left`).toBeGreaterThanOrEqual(0);
        expect(box.right, `row ${index + 1}: right`).toBeLessThanOrEqual(box.width);
        expect(box.top, `row ${index + 1}: top`).toBeGreaterThanOrEqual(0);
        expect(box.bottom, `row ${index + 1}: bottom`).toBeLessThanOrEqual(box.height);
        const scroll = await page.evaluate(() => document.scrollingElement!.scrollWidth);
        expect(scroll, `row ${index + 1}: no horizontal scroll`).toBeLessThanOrEqual(box.width);
        await page.keyboard.press('Escape');
      }
    });
  }
});
